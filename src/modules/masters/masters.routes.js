import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import {
  asyncHandler, notFound, success, paginated, validation, AppError,
} from "../../lib/errors.js";
import { MASTERS } from "./masters.config.js";

// Table names come from MASTERS, never from the request, so interpolating them
// into SQL is safe; every value is still parameterised.
function buildRouter(cfg) {
  const router = Router();
  const T = cfg.table;

  // Two levels up, derived from the config rather than declared again: a taluka
  // shows its vibhag, a district shows its state. Lets the list carry the wider
  // context without a second request per row.
  const parent = cfg.parentKey ? MASTERS[cfg.parentKey] : null;
  const grand = parent?.parentKey ? MASTERS[parent.parentKey] : null;
  const grandJoin = grand
    ? `LEFT JOIN ${parent.table} gp ON gp.id = t.${cfg.parentColumn}
       LEFT JOIN ${grand.table} g ON g.id = gp.${parent.parentColumn}`
    : "";
  const grandCols = grand ? ", g.id AS grandparent_id, g.name_mr AS grandparent_name_mr" : "";

  const schema = z.object({
    name_mr: z.string().trim().min(1, `${cfg.label} name is required`).max(120),
    name_en: z.string().trim().max(120).optional().default(""),
    code: cfg.codeRequired
      ? z.string().trim().min(1, "Code is required").max(20)
      : z.string().trim().max(20).optional().default(""),
    former_names: z.array(z.string().trim().min(1).max(120)).max(10).optional().default([]),
    is_active: z.boolean().optional().default(true),
    display_order: z.number().int().optional().default(0),
    ...(cfg.parentColumn
      ? { [cfg.parentColumn]: z.number().int().positive(`A ${MASTERS[cfg.parentKey].label.toLowerCase()} must be selected`) }
      : {}),
  });

  // Case-insensitive, scoped to the parent, ignoring soft-deleted rows — the
  // same rule the partial unique indexes enforce, checked here so the admin
  // gets a field-level message instead of a constraint violation.
  async function assertUnique(data, excludeId = null) {
    const issues = [];
    const scope = cfg.parentColumn ? `AND ${cfg.parentColumn} = $3` : "";
    const params = [data.name_mr, excludeId ?? 0];
    if (cfg.parentColumn) params.push(data[cfg.parentColumn]);

    const clash = await queryOne(
      `SELECT id FROM ${T}
       WHERE LOWER(name_mr) = LOWER($1) AND id <> $2 AND deleted_at IS NULL ${scope}`,
      params
    );
    if (clash) issues.push({ field: "name_mr", message: `This ${cfg.label.toLowerCase()} already exists` });

    if (data.code) {
      const codeClash = await queryOne(
        `SELECT id FROM ${T} WHERE UPPER(code) = UPPER($1) AND id <> $2 AND deleted_at IS NULL`,
        [data.code, excludeId ?? 0]
      );
      if (codeClash) issues.push({ field: "code", message: "This code is already in use" });
    }
    if (issues.length) throw validation(issues);
  }

  async function assertParentExists(data) {
    if (!cfg.parentColumn) return;
    const parent = await queryOne(
      `SELECT id FROM ${MASTERS[cfg.parentKey].table} WHERE id = $1 AND deleted_at IS NULL`,
      [data[cfg.parentColumn]]
    );
    if (!parent) {
      throw validation([{ field: cfg.parentColumn, message: `${MASTERS[cfg.parentKey].label} not found` }]);
    }
  }

  // Nothing is deleted while something still points at it. Children are checked
  // by foreign key; vargs and district_contacts are checked by name, because
  // they store geography as text and predate these tables.
  async function assertUnused(row) {
    if (cfg.child) {
      const [{ count }] = await query(
        `SELECT COUNT(*) AS count FROM ${MASTERS[cfg.child].table}
         WHERE ${MASTERS[cfg.child].parentColumn} = $1 AND deleted_at IS NULL`,
        [row.id]
      );
      if (parseInt(count) > 0) {
        throw new AppError(
          "DEPENDENCY_EXISTS",
          `Cannot delete: ${count} ${MASTERS[cfg.child].plural.toLowerCase()} belong to this ${cfg.label.toLowerCase()}. Remove or reassign them first.`,
          409
        );
      }
    }

    const names = [row.name_mr, ...(row.former_names || [])];
    for (const ref of cfg.usedBy) {
      const [{ count }] = await query(
        `SELECT COUNT(*) AS count FROM ${ref.table}
         WHERE ${ref.column} = ANY($1) AND deleted_at IS NULL`,
        [names]
      );
      if (parseInt(count) > 0) {
        throw new AppError(
          "DEPENDENCY_EXISTS",
          `Cannot delete: ${count} ${ref.label} still reference this ${cfg.label.toLowerCase()}.`,
          409
        );
      }
    }
  }

  // ── Public: active rows only, for the site's dropdowns ────────────────────
  router.get(
    "/public",
    asyncHandler(async (req, res) => {
      const parentId = parseInt(req.query[cfg.parentColumn] || "0");
      const conditions = ["t.is_active = TRUE", "t.deleted_at IS NULL"];
      const params = [];

      // A dependent dropdown asks for one parent's children.
      if (cfg.parentColumn && parentId > 0) {
        params.push(parentId);
        conditions.push(`t.${cfg.parentColumn} = $${params.length}`);
      }

      const rows = await query(
        `SELECT t.id, t.name_mr, t.name_en, t.code, t.former_names
                ${cfg.parentColumn ? `, t.${cfg.parentColumn}` : ""}
         FROM ${T} t
         WHERE ${conditions.join(" AND ")}
         ORDER BY t.display_order ASC, t.name_mr ASC`,
        params
      );
      res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
      return success(res, rows);
    })
  );

  // ── Admin ─────────────────────────────────────────────────────────────────
  router.get(
    "/",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const page = Math.max(1, parseInt(req.query.page || "1"));
      const pageSize = Math.min(200, Math.max(1, parseInt(req.query.limit || "25")));
      const search = (req.query.search || "").trim();
      const status = req.query.status || "";
      const trash = req.query.trash === "true";
      const parentId = parseInt(req.query[cfg.parentColumn] || "0");
      const offset = (page - 1) * pageSize;

      const conditions = [trash ? "t.deleted_at IS NOT NULL" : "t.deleted_at IS NULL"];
      const params = [];

      if (search) {
        params.push(`%${search}%`);
        conditions.push(`(t.name_mr ILIKE $${params.length} OR t.name_en ILIKE $${params.length} OR t.code ILIKE $${params.length})`);
      }
      if (status === "active") conditions.push("t.is_active = TRUE");
      if (status === "inactive") conditions.push("t.is_active = FALSE");
      if (cfg.parentColumn && parentId > 0) {
        params.push(parentId);
        conditions.push(`t.${cfg.parentColumn} = $${params.length}`);
      }
      // Filter a level higher: every taluka in a vibhag, every district in a state.
      const grandId = grand ? parseInt(req.query[parent.parentColumn] || "0") : 0;
      if (grand && grandId > 0) {
        params.push(grandId);
        conditions.push(`gp.${parent.parentColumn} = $${params.length}`);
      }

      const where = `WHERE ${conditions.join(" AND ")}`;
      const join = `${cfg.parentTable ? `LEFT JOIN ${cfg.parentTable} p ON p.id = t.${cfg.parentColumn}` : ""} ${grandJoin}`;
      const parentCols = cfg.parentTable ? ", p.name_mr AS parent_name_mr, p.name_en AS parent_name_en" : "";

      const [{ count }] = await query(`SELECT COUNT(*) AS count FROM ${T} t ${join} ${where}`, params);

      // Child counts come from one grouped subquery, not one query per row.
      const childCount = cfg.child
        ? `, (SELECT COUNT(*) FROM ${MASTERS[cfg.child].table} c
             WHERE c.${MASTERS[cfg.child].parentColumn} = t.id AND c.deleted_at IS NULL)::int AS child_count`
        : "";

      params.push(pageSize, offset);
      const rows = await query(
        `SELECT t.*${parentCols}${grandCols}${childCount}
         FROM ${T} t ${join} ${where}
         ORDER BY t.display_order ASC, t.name_mr ASC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return paginated(res, rows, parseInt(count), page, pageSize);
    })
  );

  router.get(
    "/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const join = `${cfg.parentTable ? `LEFT JOIN ${cfg.parentTable} p ON p.id = t.${cfg.parentColumn}` : ""} ${grandJoin}`;
      const parentCols = cfg.parentTable ? ", p.name_mr AS parent_name_mr, p.name_en AS parent_name_en" : "";
      const row = await queryOne(
        `SELECT t.*${parentCols}${grandCols} FROM ${T} t ${join} WHERE t.id = $1`,
        [req.params.id]
      );
      if (!row) throw notFound(cfg.label);
      return success(res, row);
    })
  );

  router.post(
    "/",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
      }
      const d = parsed.data;
      await assertParentExists(d);
      await assertUnique(d);

      const cols = ["name_mr", "name_en", "code", "former_names", "is_active", "display_order"];
      const vals = [d.name_mr, d.name_en, d.code, d.former_names, d.is_active, d.display_order];
      if (cfg.parentColumn) { cols.push(cfg.parentColumn); vals.push(d[cfg.parentColumn]); }

      const [row] = await query(
        `INSERT INTO ${T} (${cols.join(", ")})
         VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`,
        vals
      );
      return success(res, row, 201);
    })
  );

  router.put(
    "/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const existing = await queryOne(`SELECT * FROM ${T} WHERE id = $1 AND deleted_at IS NULL`, [req.params.id]);
      if (!existing) throw notFound(cfg.label);

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
      }
      const d = parsed.data;
      await assertParentExists(d);
      await assertUnique(d, existing.id);

      // Deactivating a master that children still hang off would silently empty
      // the dependent dropdown below it.
      if (existing.is_active && d.is_active === false && cfg.child) {
        const [{ count }] = await query(
          `SELECT COUNT(*) AS count FROM ${MASTERS[cfg.child].table}
           WHERE ${MASTERS[cfg.child].parentColumn} = $1 AND is_active = TRUE AND deleted_at IS NULL`,
          [existing.id]
        );
        if (parseInt(count) > 0) {
          throw new AppError(
            "DEPENDENCY_EXISTS",
            `Cannot deactivate: ${count} active ${MASTERS[cfg.child].plural.toLowerCase()} belong to this ${cfg.label.toLowerCase()}.`,
            409
          );
        }
      }

      const sets = ["name_mr=$1", "name_en=$2", "code=$3", "former_names=$4", "is_active=$5", "display_order=$6", "updated_at=NOW()"];
      const vals = [d.name_mr, d.name_en, d.code, d.former_names, d.is_active, d.display_order];
      if (cfg.parentColumn) { sets.push(`${cfg.parentColumn}=$${vals.length + 1}`); vals.push(d[cfg.parentColumn]); }
      vals.push(existing.id);

      const [row] = await query(
        `UPDATE ${T} SET ${sets.join(", ")} WHERE id=$${vals.length} RETURNING *`,
        vals
      );
      return success(res, row);
    })
  );

  router.delete(
    "/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const existing = await queryOne(`SELECT * FROM ${T} WHERE id = $1 AND deleted_at IS NULL`, [req.params.id]);
      if (!existing) throw notFound(cfg.label);
      await assertUnused(existing);

      const [row] = await query(
        `UPDATE ${T} SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING id`,
        [existing.id]
      );
      return success(res, { id: row.id, deleted: true });
    })
  );

  router.post(
    "/:id/restore",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const row = await queryOne(`SELECT * FROM ${T} WHERE id = $1 AND deleted_at IS NOT NULL`, [req.params.id]);
      if (!row) throw notFound(cfg.label);
      // The name may have been taken while this row sat in the trash.
      await assertUnique(row, row.id);
      const [restored] = await query(
        `UPDATE ${T} SET deleted_at = NULL, updated_at = NOW() WHERE id = $1 RETURNING id`,
        [row.id]
      );
      return success(res, { id: restored.id, restored: true });
    })
  );

  return router;
}

export const masterRouters = Object.fromEntries(
  Object.entries(MASTERS).map(([key, cfg]) => [key, buildRouter(cfg)])
);
