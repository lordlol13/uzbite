-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('OWN_COURIER', 'ON_DEMAND_COURIER');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('NOT_REQUESTED', 'SEARCHING', 'OFFERED', 'ASSIGNED', 'COURIER_ACCEPTED', 'READY_FOR_PICKUP', 'PICKED_UP', 'ON_THE_WAY', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CourierAffiliationStatus" AS ENUM ('INVITED', 'PENDING', 'ACTIVE', 'DISABLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CourierAvailability" AS ENUM ('AVAILABLE', 'BUSY', 'OFFLINE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "DeliveryRequestStatus" AS ENUM ('SEARCHING', 'ACCEPTED', 'EXPIRED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "courierAvailability" "CourierAvailability" NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN "landmark" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Restaurant" ADD COLUMN "acceptingOrders" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Restaurant" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Tashkent';
ALTER TABLE "Restaurant" ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Restaurant" ADD COLUMN "acceptCash" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Restaurant" ADD COLUMN "acceptCard" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Restaurant" ADD COLUMN "paymentRecipient" TEXT;

-- AlterTable
ALTER TABLE "Dish" ADD COLUMN "sku" TEXT;
ALTER TABLE "Dish" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN "title" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Post" ADD COLUMN "categoryName" TEXT;
ALTER TABLE "Post" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "Post" ADD COLUMN "aspectRatio" TEXT NOT NULL DEFAULT '9:16';
ALTER TABLE "Post" ADD COLUMN "publishedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RestaurantSettings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "businessHours" JSONB NOT NULL,
    "acceptingOrders" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tashkent',
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantDeliverySettings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "ownCouriersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "onDemandCouriersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "preferredMode" "DeliveryMode" NOT NULL DEFAULT 'OWN_COURIER',
    "baseDeliveryFee" DECIMAL(14,2) NOT NULL DEFAULT 12000,
    "courierRewardFee" DECIMAL(14,2) NOT NULL DEFAULT 10000,
    "offerTimeoutSeconds" INTEGER NOT NULL DEFAULT 120,
    "searchTimeoutSeconds" INTEGER NOT NULL DEFAULT 300,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantDeliverySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantCourierAffiliation" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "inviteCode" TEXT,
    "status" "CourierAffiliationStatus" NOT NULL DEFAULT 'INVITED',
    "availability" "CourierAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "activeLoad" INTEGER NOT NULL DEFAULT 0,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantCourierAffiliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "mode" "DeliveryMode" NOT NULL,
    "assignedCourierId" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "pickupAddressSnapshot" JSONB NOT NULL,
    "deliveryAddressSnapshot" JSONB NOT NULL,
    "deliveryFee" DECIMAL(14,2) NOT NULL,
    "courierReward" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "offeredAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryRequest" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "status" "DeliveryRequestStatus" NOT NULL DEFAULT 'SEARCHING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "acceptedByCourierId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOffer" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "deliveryId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "mode" "DeliveryMode" NOT NULL,
    "status" "DeliveryOfferStatus" NOT NULL DEFAULT 'PENDING',
    "rewardAmount" DECIMAL(14,2) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "DeliveryOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierAssignment" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "mode" "DeliveryMode" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "CourierAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryStatusHistory" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "fromStatus" "DeliveryStatus",
    "toStatus" "DeliveryStatus" NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileFormat" TEXT NOT NULL,
    "conflictMode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "addedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "conflictCount" INTEGER NOT NULL DEFAULT 0,
    "previewData" JSONB,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJobRowError" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "sku" TEXT,
    "dishName" TEXT,
    "field" TEXT,
    "errorCode" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "rawRow" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJobRowError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exportType" TEXT NOT NULL,
    "fileFormat" TEXT NOT NULL,
    "filters" JSONB,
    "rowCount" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dish_restaurantId_sku_key" ON "Dish"("restaurantId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSettings_restaurantId_key" ON "RestaurantSettings"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantDeliverySettings_restaurantId_key" ON "RestaurantDeliverySettings"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantCourierAffiliation_inviteCode_key" ON "RestaurantCourierAffiliation"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantCourierAffiliation_restaurantId_courierId_key" ON "RestaurantCourierAffiliation"("restaurantId", "courierId");

-- CreateIndex
CREATE INDEX "RestaurantCourierAffiliation_restaurantId_status_idx" ON "RestaurantCourierAffiliation"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "RestaurantCourierAffiliation_courierId_status_idx" ON "RestaurantCourierAffiliation"("courierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_orderId_key" ON "Delivery"("orderId");

-- CreateIndex
CREATE INDEX "Delivery_restaurantId_status_idx" ON "Delivery"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "Delivery_assignedCourierId_status_idx" ON "Delivery"("assignedCourierId", "status");

-- CreateIndex
CREATE INDEX "DeliveryRequest_deliveryId_status_idx" ON "DeliveryRequest"("deliveryId", "status");

-- CreateIndex
CREATE INDEX "DeliveryRequest_restaurantId_status_idx" ON "DeliveryRequest"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "DeliveryOffer_courierId_status_idx" ON "DeliveryOffer"("courierId", "status");

-- CreateIndex
CREATE INDEX "DeliveryOffer_deliveryId_status_idx" ON "DeliveryOffer"("deliveryId", "status");

-- CreateIndex
CREATE INDEX "DeliveryOffer_requestId_status_idx" ON "DeliveryOffer"("requestId", "status");

-- CreateIndex
CREATE INDEX "CourierAssignment_deliveryId_isActive_idx" ON "CourierAssignment"("deliveryId", "isActive");

-- CreateIndex
CREATE INDEX "CourierAssignment_courierId_isActive_idx" ON "CourierAssignment"("courierId", "isActive");

-- CreateIndex
CREATE INDEX "CourierAssignment_restaurantId_assignedAt_idx" ON "CourierAssignment"("restaurantId", "assignedAt");

-- CreateIndex
CREATE INDEX "DeliveryStatusHistory_deliveryId_createdAt_idx" ON "DeliveryStatusHistory"("deliveryId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryStatusHistory_orderId_createdAt_idx" ON "DeliveryStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_restaurantId_createdAt_idx" ON "ImportJob"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJobRowError_importJobId_rowNumber_idx" ON "ImportJobRowError"("importJobId", "rowNumber");

-- CreateIndex
CREATE INDEX "ExportJob_restaurantId_createdAt_idx" ON "ExportJob"("restaurantId", "createdAt");

-- AddForeignKey
ALTER TABLE "RestaurantSettings" ADD CONSTRAINT "RestaurantSettings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantDeliverySettings" ADD CONSTRAINT "RestaurantDeliverySettings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantCourierAffiliation" ADD CONSTRAINT "RestaurantCourierAffiliation_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantCourierAffiliation" ADD CONSTRAINT "RestaurantCourierAffiliation_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_assignedCourierId_fkey" FOREIGN KEY ("assignedCourierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRequest" ADD CONSTRAINT "DeliveryRequest_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRequest" ADD CONSTRAINT "DeliveryRequest_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOffer" ADD CONSTRAINT "DeliveryOffer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DeliveryRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOffer" ADD CONSTRAINT "DeliveryOffer_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOffer" ADD CONSTRAINT "DeliveryOffer_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierAssignment" ADD CONSTRAINT "CourierAssignment_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierAssignment" ADD CONSTRAINT "CourierAssignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierAssignment" ADD CONSTRAINT "CourierAssignment_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierAssignment" ADD CONSTRAINT "CourierAssignment_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryStatusHistory" ADD CONSTRAINT "DeliveryStatusHistory_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJobRowError" ADD CONSTRAINT "ImportJobRowError_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Authoritative race-condition guards: one active assignment & one active search per delivery
CREATE UNIQUE INDEX "CourierAssignment_one_active_per_delivery"
ON "CourierAssignment" ("deliveryId")
WHERE "isActive" = true;

CREATE UNIQUE INDEX "DeliveryRequest_one_active_per_delivery"
ON "DeliveryRequest" ("deliveryId")
WHERE "status" = 'SEARCHING';
