-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_restaurantId_createdAt_idx" ON "Order"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_restaurantId_status_createdAt_idx" ON "Order"("restaurantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Expense_restaurantId_invoiceNumber_idx" ON "Expense"("restaurantId", "invoiceNumber");
