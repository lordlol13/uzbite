ALTER TABLE "Restaurant" ADD COLUMN "galleryUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Local artwork for the bundled fictional catalog. Other restaurants start with an empty gallery.
UPDATE "Restaurant" AS restaurant
SET "galleryUrls" = artwork.urls, "coverUrl" = artwork.urls[1]
FROM (VALUES
  ('rest-basilico', ARRAY['/images/uzbite/interior-chorsu.jpg', '/images/uzbite/restaurant-cover.jpg', '/images/uzbite/interior-tandir.jpg', '/images/uzbite/interior-samarqand.jpg']),
  ('rest-burger', ARRAY['/images/uzbite/interior-tandir.jpg', '/images/uzbite/interior-chorsu.jpg', '/images/uzbite/restaurant-cover.jpg']),
  ('rest-mori', ARRAY['/images/uzbite/interior-samarqand.jpg', '/images/uzbite/restaurant-cover.jpg', '/images/uzbite/interior-chorsu.jpg']),
  ('rest-non', ARRAY['/images/uzbite/interior-tandir.jpg', '/images/uzbite/restaurant-cover.jpg', '/images/uzbite/interior-samarqand.jpg']),
  ('rest-osh', ARRAY['/images/uzbite/restaurant-cover.jpg', '/images/uzbite/interior-chorsu.jpg', '/images/uzbite/interior-tandir.jpg', '/images/uzbite/interior-samarqand.jpg']),
  ('rest-saffron', ARRAY['/images/uzbite/interior-samarqand.jpg', '/images/uzbite/interior-chorsu.jpg', '/images/uzbite/restaurant-cover.jpg'])
) AS artwork(id, urls)
WHERE restaurant.id = artwork.id AND restaurant."coverUrl" LIKE 'https://images.pexels.com/photos/%';

UPDATE "Restaurant"
SET "addressText" = replace("addressText", ' (демонстрационная точка)', '')
WHERE id IN ('rest-basilico', 'rest-burger', 'rest-mori', 'rest-non', 'rest-osh', 'rest-saffron')
  AND "addressText" LIKE '% (демонстрационная точка)';
