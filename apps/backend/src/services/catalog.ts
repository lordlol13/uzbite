import { Prisma } from '@prisma/client';
import { receiptStorageReady } from '../config/env.js';

export function restaurantInclude(userId?: string) {
  return {
    reviews: { select: { rating: true } },
    follows: { where: { userId: userId ?? '__guest__' }, select: { userId: true } },
    _count: { select: { reviews: true, follows: true } },
  } satisfies Prisma.RestaurantInclude;
}

export type RestaurantRecord = Prisma.RestaurantGetPayload<{
  include: ReturnType<typeof restaurantInclude>;
}>;

export function restaurantDto(restaurant: RestaurantRecord) {
  const {
    reviews,
    follows,
    _count,
    paymentDetails: _details,
    paymentQrUrl: _qr,
    paymentInstructions: _instructions,
    paymentRecipient: _recipient,
    ...rest
  } = restaurant;
  return {
    ...rest,
    isOpen: restaurant.isOpen && restaurant.acceptingOrders,
    galleryUrls: [...new Set(restaurant.galleryUrls)],
    rating: reviews.length
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : null,
    reviewCount: _count.reviews,
    followerCount: _count.follows,
    isFollowing: follows.length > 0,
    cardPaymentAvailable: Boolean(
      restaurant.paymentDetails && restaurant.paymentQrUrl && receiptStorageReady,
    ),
  };
}

export function postInclude(userId?: string) {
  return {
    restaurant: { include: restaurantInclude(userId) },
    dish: true,
    media: { orderBy: { sortOrder: 'asc' as const } },
    likes: { where: { userId: userId ?? '__guest__' }, select: { userId: true } },
    _count: { select: { likes: true, comments: true } },
  } satisfies Prisma.PostInclude;
}

export type PostRecord = Prisma.PostGetPayload<{ include: ReturnType<typeof postInclude> }>;

export function postDto(post: PostRecord) {
  const { likes, _count, restaurant, ...rest } = post;
  return {
    ...rest,
    restaurant: restaurantDto(restaurant),
    isLiked: likes.length > 0,
    likeCount: _count.likes,
    commentCount: _count.comments,
  };
}

export const commentUserSelect = {
  id: true,
  name: true,
  username: true,
  avatarUrl: true,
} as const;
