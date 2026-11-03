-- Perguntas livres (LIVRE) viram Folha (FOLHA): cada pergunta vira um exercício "escolha".
-- Os campos de cada pergunta são os mesmos (key, prompt, hint, support, supportIcon, options, correctId),
-- então as chaves das tentativas já gravadas continuam valendo para os gráficos.
-- Fica em migração separada porque o Postgres não deixa usar um valor de enum na mesma transação em que ele foi criado.
UPDATE "Activity"
SET
  "module" = 'FOLHA',
  "content" = jsonb_build_object(
    'items',
    (
      SELECT jsonb_agg(item || jsonb_build_object('type', 'escolha') ORDER BY position)
      FROM jsonb_array_elements("content" -> 'items') WITH ORDINALITY AS t(item, position)
    )
  )
WHERE "module" = 'LIVRE';
