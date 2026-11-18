# Два режима доставки UzBite

## 1. Разделение статусов

Основной статус заказа (`Order.status`) и статус доставки (`Delivery.status`) разделены:
- **OrderStatus**: `PENDING_ACCEPTANCE` → `ACCEPTED` → `PREPARING` → `DELIVERING` → `DELIVERED` (и `CANCELLED`).
- **DeliveryStatus**: `NOT_REQUESTED`, `SEARCHING`, `OFFERED`, `ASSIGNED`, `COURIER_ACCEPTED`, `READY_FOR_PICKUP`, `PICKED_UP`, `ON_THE_WAY`, `DELIVERED`, `FAILED`, `CANCELLED`.

Пока еда готовится (`Order.status = PREPARING`), доставка уже может иметь статус `COURIER_ACCEPTED` («Курьер найден»). Заказ **не переходит** в статус `DELIVERING` только из-за нажатия курьером «Принять» — переход в `DELIVERING` происходит только после фактической передачи и начала пути к покупателю (`ON_THE_WAY` или явного старта доставки при передаче).

## 2. Настройки способов доставки ресторана

В `Настройки → Доставка` ресторан независимо включает:
- `ownCouriersEnabled` — «Использовать своих курьеров»
- `onDemandCouriersEnabled` — «Использовать заказных курьеров UzBite»
- `preferredMode`, `baseDeliveryFee`, `courierRewardFee`

Если оба режима отключены, новые заказы с доставкой в этот ресторан отклоняются с кодом `DELIVERY_UNAVAILABLE`.

## 3. Режим A — Собственные курьеры (`OWN_COURIER`)

1. Ресторан отправляет приглашение (`POST /api/restaurant-account/couriers/invitations`) по email/username курьера.
2. Создаётся `RestaurantCourierAffiliation` со статусом `INVITED` и кодом `inviteCode`. Ресторан **не может** привязать курьера без его согласия.
3. Курьер принимает приглашение (`POST /api/courier/affiliations/accept`), статус привязки становится `ACTIVE`.
4. В заказе ресторан нажимает «Доставка своим курьером» → выбирает доступного курьера (`AVAILABLE`) → `POST /api/restaurant-account/deliveries/:orderId/assign-own`.
5. Backend создаёт `DeliveryOffer` со сроком действия (`offerTimeoutSeconds`) и отправляет `delivery:offer_created` через Socket.IO.
6. Если курьер отклоняет (`POST /api/courier/delivery-offers/:id/reject`) или истекает срок (`EXPIRED`), статус доставки становится `FAILED` (молчание никогда не считается согласием), и ресторан может выбрать другого курьера или переключиться на Режим B.

## 4. Режим B — Заказные курьеры UzBite (`ON_DEMAND_COURIER`)

1. Ресторан выбирает «Найти курьера UzBite» → подтверждает параметры → `POST /api/restaurant-account/deliveries/:orderId/request-on-demand`.
2. Backend в `Serializable` транзакции создаёт `DeliveryRequest` (`SEARCHING`, защищено частичным уникальным индексом `DeliveryRequest_one_active_per_delivery`) и рассылает `DeliveryOffer` доступным курьерам (`role=COURIER`, `courierAvailability=AVAILABLE`, без активного `CourierAssignment`).
3. Событие `delivery:search_started` уходит ресторану, `delivery:offer_created` — курьерам.
4. При одновременном принятии двумя курьерами побеждает только один за счёт:
   - `Serializable` транзакции PostgreSQL;
   - условного `updateMany` на `DeliveryRequest` (`status = 'SEARCHING'`) и `Delivery` (`assignedCourierId IS NULL`);
   - частичного уникального индекса `CourierAssignment_one_active_per_delivery` (`WHERE "isActive" = true`).
   Второй курьер получает `HTTP 409 ALREADY_ASSIGNED` («Этот заказ уже принят другим курьером»).
5. Остальные ожидающие предложения автоматически отменяются (`CANCELLED`).

## 5. Передача, завершение и отмена

- Ресторан отмечает готовность (`mark-ready` → `READY_FOR_PICKUP`) и подтверждает передачу (`handover` → `PICKED_UP` / `ON_THE_WAY`).
- Курьер обновляет этапы через `PATCH /api/courier/deliveries/:id/status` (`PICKED_UP`, `ON_THE_WAY` → `Order.status = DELIVERING`, `DELIVERED` → `Order.status = DELIVERED`).
- Снятие назначенного курьера (`cancel-assignment`) разрешено только **до** фактической передачи (`PICKED_UP`).
- Покупатель в мобильном/веб-приложении **никогда не получает живую GPS-позицию курьера** — только этапы статуса заказа.
