-- Staff workspace links have been retired. Removing the parent rows also
-- removes their permissions/activity through existing cascade constraints;
-- vendor records remain, with their workspace_id set to NULL.
delete from public.crm_field_workspaces;
