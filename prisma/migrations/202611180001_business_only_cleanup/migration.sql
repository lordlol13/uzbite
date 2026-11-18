-- Remove any non-business COURIER rows before narrowing Role enum
DELETE FROM "User" WHERE "role"::text = 'COURIER';

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('USER', 'RESTAURANT');
ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
COMMIT;

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_parentId_fkey";

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_postId_fkey";

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_userId_fkey";

-- DropForeignKey
ALTER TABLE "CourierAssignment" DROP CONSTRAINT "CourierAssignment_courierId_fkey";

-- DropForeignKey
ALTER TABLE "CourierAssignment" DROP CONSTRAINT "CourierAssignment_deliveryId_fkey";

-- DropForeignKey
ALTER TABLE "CourierAssignment" DROP CONSTRAINT "CourierAssignment_orderId_fkey";

-- DropForeignKey
ALTER TABLE "CourierAssignment" DROP CONSTRAINT "CourierAssignment_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "Delivery" DROP CONSTRAINT "Delivery_assignedCourierId_fkey";

-- DropForeignKey
ALTER TABLE "Delivery" DROP CONSTRAINT "Delivery_orderId_fkey";

-- DropForeignKey
ALTER TABLE "Delivery" DROP CONSTRAINT "Delivery_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryOffer" DROP CONSTRAINT "DeliveryOffer_courierId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryOffer" DROP CONSTRAINT "DeliveryOffer_deliveryId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryOffer" DROP CONSTRAINT "DeliveryOffer_requestId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryRequest" DROP CONSTRAINT "DeliveryRequest_deliveryId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryRequest" DROP CONSTRAINT "DeliveryRequest_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryStatusHistory" DROP CONSTRAINT "DeliveryStatusHistory_deliveryId_fkey";

-- DropForeignKey
ALTER TABLE "ExportJob" DROP CONSTRAINT "ExportJob_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "ExportJob" DROP CONSTRAINT "ExportJob_userId_fkey";

-- DropForeignKey
ALTER TABLE "Follow" DROP CONSTRAINT "Follow_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "Follow" DROP CONSTRAINT "Follow_userId_fkey";

-- DropForeignKey
ALTER TABLE "ImportJob" DROP CONSTRAINT "ImportJob_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "ImportJob" DROP CONSTRAINT "ImportJob_userId_fkey";

-- DropForeignKey
ALTER TABLE "ImportJobRowError" DROP CONSTRAINT "ImportJobRowError_importJobId_fkey";

-- DropForeignKey
ALTER TABLE "Like" DROP CONSTRAINT "Like_postId_fkey";

-- DropForeignKey
ALTER TABLE "Like" DROP CONSTRAINT "Like_userId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_userId_fkey";

-- DropForeignKey
ALTER TABLE "OrderStatusHistory" DROP CONSTRAINT "OrderStatusHistory_orderId_fkey";

-- DropForeignKey
ALTER TABLE "Post" DROP CONSTRAINT "Post_dishId_fkey";

-- DropForeignKey
ALTER TABLE "Post" DROP CONSTRAINT "Post_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "PostMedia" DROP CONSTRAINT "PostMedia_postId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantCourierAffiliation" DROP CONSTRAINT "RestaurantCourierAffiliation_courierId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantCourierAffiliation" DROP CONSTRAINT "RestaurantCourierAffiliation_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantDeliverySettings" DROP CONSTRAINT "RestaurantDeliverySettings_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantSettings" DROP CONSTRAINT "RestaurantSettings_restaurantId_fkey";

-- AlterTable
ALTER TABLE "Restaurant" DROP COLUMN "galleryUrls";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "courierAvailability";

-- DropTable
DROP TABLE "Comment";

-- DropTable
DROP TABLE "CourierAssignment";

-- DropTable
DROP TABLE "Delivery";

-- DropTable
DROP TABLE "DeliveryOffer";

-- DropTable
DROP TABLE "DeliveryRequest";

-- DropTable
DROP TABLE "DeliveryStatusHistory";

-- DropTable
DROP TABLE "ExportJob";

-- DropTable
DROP TABLE "Follow";

-- DropTable
DROP TABLE "ImportJob";

-- DropTable
DROP TABLE "ImportJobRowError";

-- DropTable
DROP TABLE "Like";

-- DropTable
DROP TABLE "Notification";

-- DropTable
DROP TABLE "OrderStatusHistory";

-- DropTable
DROP TABLE "Post";

-- DropTable
DROP TABLE "PostMedia";

-- DropTable
DROP TABLE "RestaurantCourierAffiliation";

-- DropTable
DROP TABLE "RestaurantDeliverySettings";

-- DropTable
DROP TABLE "RestaurantSettings";

-- DropEnum
DROP TYPE "CourierAffiliationStatus";

-- DropEnum
DROP TYPE "CourierAvailability";

-- DropEnum
DROP TYPE "DeliveryMode";

-- DropEnum
DROP TYPE "DeliveryOfferStatus";

-- DropEnum
DROP TYPE "DeliveryRequestStatus";

-- DropEnum
DROP TYPE "DeliveryStatus";

-- DropEnum
DROP TYPE "MediaType";

