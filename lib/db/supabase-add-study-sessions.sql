-- Campus Connect: add the study_sessions table to an existing database.
-- Paste this into Supabase > SQL Editor and click Run, once.
-- (A brand-new database uses supabase-setup.sql instead, which already includes it.)

CREATE TABLE "study_sessions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "study_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"owner_id" text NOT NULL,
	"course_id" integer NOT NULL,
	"minutes" integer NOT NULL,
	"note" text,
	"studied_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;

-- Same protection as the other tables: only the app's server can read or write.
ALTER TABLE "study_sessions" ENABLE ROW LEVEL SECURITY;
