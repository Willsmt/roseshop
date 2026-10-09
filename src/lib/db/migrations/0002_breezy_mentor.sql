CREATE TABLE "fotos_envio" (
	"id" uuid PRIMARY KEY NOT NULL,
	"formato" text NOT NULL,
	"chave" text GENERATED ALWAYS AS ('fotos/' || id::text || CASE formato WHEN 'webp' THEN '.webp' ELSE '.jpg' END) STORED NOT NULL,
	"tamanho" integer NOT NULL,
	"enviado_por" text NOT NULL,
	"estado" text DEFAULT 'emitido' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmado_em" timestamp with time zone,
	CONSTRAINT "fotos_envio_chave_unique" UNIQUE("chave"),
	CONSTRAINT "fotos_envio_id_v4" CHECK (uuid_extract_version("fotos_envio"."id") = 4),
	CONSTRAINT "fotos_envio_formato" CHECK ("fotos_envio"."formato" IN ('webp', 'jpeg')),
	CONSTRAINT "fotos_envio_tamanho" CHECK ("fotos_envio"."tamanho" BETWEEN 1 AND 1048576),
	CONSTRAINT "fotos_envio_estado" CHECK ("fotos_envio"."estado" IN ('emitido', 'confirmado')),
	CONSTRAINT "fotos_envio_confirmacao" CHECK (("fotos_envio"."estado" = 'confirmado') = ("fotos_envio"."confirmado_em" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ia_uso" (
	"dia" date NOT NULL,
	"email" text NOT NULL,
	"n" integer NOT NULL,
	CONSTRAINT "ia_uso_pkey" PRIMARY KEY("dia","email"),
	CONSTRAINT "ia_uso_n_minimo" CHECK ("ia_uso"."n" >= 1)
);
--> statement-breakpoint
ALTER TABLE "produto_fotos" ADD COLUMN "enviado_por" text NOT NULL;--> statement-breakpoint
ALTER TABLE "produto_fotos" ADD COLUMN "enviado_em" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "fotos_versao" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "fotos_operacao" uuid;--> statement-breakpoint
ALTER TABLE "produto_fotos" ADD CONSTRAINT "produto_fotos_objeto_unique" UNIQUE("chave_objeto");--> statement-breakpoint
ALTER TABLE "produto_fotos" ADD CONSTRAINT "produto_fotos_objeto_formato" CHECK ("produto_fotos"."chave_objeto" ~ '^fotos/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|jpg)$');