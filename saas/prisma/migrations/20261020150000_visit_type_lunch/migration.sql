-- Plan-PricingModel Chunk 6 (T-152): the company simple form's "Lunch only" visit type (D-10).
-- Adding an enum value is safe for running code: nothing writes LUNCH until Chunk 7.
ALTER TYPE "VisitType" ADD VALUE 'LUNCH';
