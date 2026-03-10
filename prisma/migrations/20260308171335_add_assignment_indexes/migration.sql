-- CreateIndex
CREATE INDEX "ScheduleAssignment_scheduleVersionId_date_idx" ON "ScheduleAssignment"("scheduleVersionId", "date");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_soldierProfileId_idx" ON "ScheduleAssignment"("soldierProfileId");
