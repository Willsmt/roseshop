CREATE TABLE "produto_fotos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "produto_fotos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"produto_id" integer NOT NULL,
	"posicao" smallint NOT NULL,
	"chave_objeto" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produto_fotos_produto_posicao_unique" UNIQUE("produto_id","posicao"),
	CONSTRAINT "produto_fotos_posicao_faixa" CHECK ("produto_fotos"."posicao" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "produtos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "produtos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"categoria_id" integer NOT NULL,
	"nome" text NOT NULL,
	"chave" text GENERATED ALWAYS AS (categoria_chave(nome)) STORED NOT NULL,
	"descricao" text,
	"preco_centavos" integer,
	"a_partir_de" boolean DEFAULT false NOT NULL,
	"esgotado" boolean DEFAULT false NOT NULL,
	"destaque_vaga" smallint,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_por" text NOT NULL,
	"atualizado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produtos_chave_unique" UNIQUE("chave"),
	CONSTRAINT "produtos_nome_tamanho" CHECK (char_length("produtos"."nome") BETWEEN 3 AND 80),
	CONSTRAINT "produtos_nome_sem_pontas" CHECK ("produtos"."nome" = btrim("produtos"."nome")),
	CONSTRAINT "produtos_nome_sem_espacos_duplos" CHECK ("produtos"."nome" !~ '\s{2,}'),
	CONSTRAINT "produtos_descricao_tamanho" CHECK ("produtos"."descricao" IS NULL OR char_length("produtos"."descricao") <= 1000),
	CONSTRAINT "produtos_preco_faixa" CHECK ("produtos"."preco_centavos" IS NULL OR "produtos"."preco_centavos" BETWEEN 1 AND 9999999),
	CONSTRAINT "produtos_a_partir_de_com_preco" CHECK (NOT "produtos"."a_partir_de" OR "produtos"."preco_centavos" IS NOT NULL),
	CONSTRAINT "produtos_destaque_vaga_faixa" CHECK ("produtos"."destaque_vaga" BETWEEN 1 AND 8),
	CONSTRAINT "produtos_destaque_disponivel" CHECK (NOT ("produtos"."esgotado" AND "produtos"."destaque_vaga" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "produto_fotos" ADD CONSTRAINT "produto_fotos_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "produtos_categoria_id_idx" ON "produtos" USING btree ("categoria_id");--> statement-breakpoint
CREATE UNIQUE INDEX "produtos_destaque_vaga_unique" ON "produtos" USING btree ("destaque_vaga") WHERE "produtos"."destaque_vaga" IS NOT NULL;