-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('INGREDIENTS', 'PACKAGING', 'SALARY', 'RENT', 'UTILITIES', 'COMMUNICATION', 'MARKETING', 'DELIVERY', 'EQUIPMENT', 'TAXES', 'OTHER');

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN "ownerId" TEXT;

-- AlterTable
ALTER TABLE "Dish" ADD COLUMN "costPrice" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "phone" TEXT,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'INGREDIENTS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "supplierId" TEXT,
    "category" "ExpenseCategory" NOT NULL,
    "itemName" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "quantity" DECIMAL(14,3),
    "unit" TEXT,
    "unitPrice" DECIMAL(14,2),
    "invoiceNumber" TEXT,
    "spentAt" TIMESTAMP(3) NOT NULL,
    "receiptId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseBudget" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "limit" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_ownerId_key" ON "Restaurant"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_restaurantId_name_key" ON "Supplier"("restaurantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_receiptId_key" ON "Expense"("receiptId");

-- CreateIndex
CREATE INDEX "Expense_restaurantId_spentAt_idx" ON "Expense"("restaurantId", "spentAt");

-- CreateIndex
CREATE INDEX "Expense_restaurantId_category_spentAt_idx" ON "Expense"("restaurantId", "category", "spentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseBudget_restaurantId_category_month_key" ON "ExpenseBudget"("restaurantId", "category", "month");

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseBudget" ADD CONSTRAINT "ExpenseBudget_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
