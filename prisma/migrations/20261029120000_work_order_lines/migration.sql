-- Строки оплаты монтажнику, отредактированные мастером (наряд как КП, 29.10.2026)
ALTER TABLE "MeasurementObject" ADD COLUMN "workOrderLines" JSONB;
