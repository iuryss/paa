// Gera o SQL para criar ou trocar a senha de um professor/terapeuta em produção (sem seed).
// A senha vem de uma variável de ambiente: assim não depende de aspas do terminal e não aparece no histórico.
//
//   PowerShell:
//     $env:NEW_PASSWORD='SuaSenhaForteAqui'
//     node scripts/make-user-sql.mjs update seu-email@dominio.com
//     node scripts/make-user-sql.mjs insert seu-email@dominio.com "Seu Nome" TEACHER
//     Remove-Item Env:NEW_PASSWORD
//
// Cole o SQL impresso no SQL Editor do banco. Nada é enviado para lugar nenhum.
import bcrypt from "bcryptjs";

const [mode, emailArg, nameArg = "Professor", role = "TEACHER"] = process.argv.slice(2);
const password = process.env.NEW_PASSWORD;

function fail(message) {
  console.error(`Erro: ${message}`);
  process.exit(1);
}

if (!["insert", "update"].includes(mode ?? "")) fail('use "insert" ou "update" como primeiro argumento.');
if (!emailArg) fail("informe o e-mail.");
if (!password) fail("defina a senha antes: $env:NEW_PASSWORD='SuaSenha' (com aspas simples).");
if (password.length < 10) fail("a senha precisa ter pelo menos 10 caracteres (a mesma regra do sistema).");
if (!["TEACHER", "THERAPIST"].includes(role)) fail("a função deve ser TEACHER ou THERAPIST.");

// O sistema converte o e-mail digitado no login para minúsculas, então o banco precisa estar assim.
const email = emailArg.trim().toLowerCase();
const sql = (value) => `'${String(value).replace(/'/g, "''")}'`;

const hash = await bcrypt.hash(password, 12);

// Confere ANTES de imprimir: o hash gerado precisa casar com a senha informada.
if (!(await bcrypt.compare(password, hash))) fail("falha interna ao gerar o hash.");

console.log("\n-- Cole no SQL Editor do banco:\n");
if (mode === "update") {
  console.log(`UPDATE "User" SET "passwordHash" = ${sql(hash)}, active = true WHERE email = ${sql(email)};`);
} else {
  console.log(
    `INSERT INTO "User" (id, role, email, "passwordHash", "displayName", active, "createdAt", "updatedAt")\n` +
      `VALUES (${sql(`prof_${Date.now()}`)}, ${sql(role)}, ${sql(email)}, ${sql(hash)}, ${sql(nameArg)}, true, now(), now());`,
  );
}
console.log(`\n-- Depois confira (deve mostrar tam_hash = 60 e a função ${role}):`);
console.log(`SELECT email, role, active, length("passwordHash") AS tam_hash FROM "User" WHERE email = ${sql(email)};\n`);
console.log(`-- O hash acima corresponde à senha informada (verificado agora há pouco).`);
