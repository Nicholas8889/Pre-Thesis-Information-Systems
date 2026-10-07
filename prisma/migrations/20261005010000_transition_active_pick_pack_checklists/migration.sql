BEGIN;

-- Capture only unfinished legacy sheets. Completed sheets and every sheet
-- already linked to a delivery retain their original quantities/personnel.
CREATE TEMP TABLE checklist_transition (
  id TEXT PRIMARY KEY,
  old_snapshot JSONB NOT NULL
) ON COMMIT DROP;

INSERT INTO checklist_transition (id, old_snapshot)
SELECT list.id, to_jsonb(list) || jsonb_build_object('items', (
  SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.id), '[]'::jsonb)
  FROM picking_list_items item WHERE item.picking_list_id = list.id
))
FROM picking_lists list
WHERE NOT list.uses_checklist
  AND list.status IN ('Pending', 'InProgress')
  AND NOT EXISTS (SELECT 1 FROM delivery_notes note WHERE note.picking_list_id = list.id)
  AND NOT EXISTS (SELECT 1 FROM delivery_note_sources source WHERE source.picking_list_id = list.id)
ORDER BY list.id
FOR UPDATE OF list;

-- A delivery creator may have finished while a row lock was being acquired.
DELETE FROM checklist_transition captured
WHERE EXISTS (SELECT 1 FROM delivery_notes note WHERE note.picking_list_id = captured.id)
   OR EXISTS (SELECT 1 FROM delivery_note_sources source WHERE source.picking_list_id = captured.id);

UPDATE picking_list_items item
SET is_checked = false
FROM checklist_transition captured WHERE item.picking_list_id = captured.id;

UPDATE picking_lists list
SET uses_checklist = true,
    picker_name = COALESCE(NULLIF(BTRIM(list.picker_name), ''), NULLIF(BTRIM(list.packer_name), '')),
    packer_name = NULL,
    updated_at = CURRENT_TIMESTAMP
FROM checklist_transition captured WHERE list.id = captured.id;

INSERT INTO audit_trails (
  id, actor_username, actor_display_name, actor_role, module_name, entity_type,
  entity_id, record_reference, action, change_summary, old_value, new_value
)
SELECT gen_random_uuid()::text, 'system', 'Pick & Pack checklist migration', 'System',
  'Pick & Pack', 'PICKING_LIST', list.id, list.picking_list_number,
  'CHECKLIST_MIGRATED', 'Active legacy sheet moved to one PIC and unchecked Pack checklist',
  captured.old_snapshot::text,
  (to_jsonb(list) || jsonb_build_object('items', (
    SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.id), '[]'::jsonb)
    FROM picking_list_items item WHERE item.picking_list_id = list.id
  )))::text
FROM checklist_transition captured JOIN picking_lists list ON list.id = captured.id;

COMMIT;
