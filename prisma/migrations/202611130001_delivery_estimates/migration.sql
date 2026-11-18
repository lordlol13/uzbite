ALTER TABLE "User" ADD COLUMN "deliveryAddressId" TEXT;
CREATE INDEX "User_deliveryAddressId_idx" ON "User"("deliveryAddressId");
ALTER TABLE "User" ADD CONSTRAINT "User_deliveryAddressId_fkey"
  FOREIGN KEY ("deliveryAddressId") REFERENCES "UserAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Restaurant" ADD COLUMN "preparationMinutes" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_preparationMinutes_check"
  CHECK ("preparationMinutes" BETWEEN 1 AND 180);
