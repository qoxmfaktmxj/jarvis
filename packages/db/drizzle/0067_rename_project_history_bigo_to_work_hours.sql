-- Rename project_history.bigo → work_hours.
--
-- Reason: legacy Oracle TBIZ011.BIGO (literal "비고"/memo) was operationally
-- repurposed as a work-hours field — verified by JSP `Header:"근무시간"`
-- mapping (projectHisMgr.jsp) and dump samples (e.g. '08:00~17:00',
-- '09:30~18:30'). The misleading name has now been corrected at the schema
-- level. The sibling project_beacon.bigo is left untouched (genuine memo).
ALTER TABLE "project_history" RENAME COLUMN "bigo" TO "work_hours";
