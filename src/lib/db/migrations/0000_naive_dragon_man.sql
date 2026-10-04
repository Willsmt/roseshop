-- Feature 002 (ADR-008, D2-B): chave normalizada de categoria. Só built-ins IMMUTABLE:
-- minúscula, NFD, remove marcas combinantes U+0300–U+036F, hífen vira espaço, colapsa
-- espaços e tira as pontas. Mudar a regra exige migration nova que recrie a coluna
-- gerada e o índice (alterar só o corpo não recalcula valores gravados).
CREATE FUNCTION categoria_chave(texto text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT btrim(
    regexp_replace(
      replace(
        regexp_replace(normalize(lower(texto), NFD), '[\u0300-\u036F]', '', 'g'),
        '-', ' '
      ),
      '\s+', ' ', 'g'
    )
  )
$$;
--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categorias_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nome" text NOT NULL,
	"chave" text GENERATED ALWAYS AS (categoria_chave(nome)) STORED NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_chave_unique" UNIQUE("chave"),
	CONSTRAINT "categorias_nome_tamanho" CHECK (char_length("categorias"."nome") BETWEEN 2 AND 40),
	CONSTRAINT "categorias_nome_sem_pontas" CHECK ("categorias"."nome" = btrim("categorias"."nome")),
	CONSTRAINT "categorias_nome_sem_espacos_duplos" CHECK ("categorias"."nome" !~ '\s{2,}')
);
--> statement-breakpoint
-- seed:categorias:start
INSERT INTO "categorias" ("nome") VALUES
	('Bolsas'),
	('Guarda-chuvas'),
	('Tupperware'),
	('Panos de prato'),
	('Meias');
-- seed:categorias:end
