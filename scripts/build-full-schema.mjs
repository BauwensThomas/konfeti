// Concatène toutes les migrations (supabase/migrations/*.sql, dans l'ordre
// chronologique du nom de fichier) en un seul fichier `supabase/full-schema.sql`
// -- retour Thomas : "un fichier sql avec toutes les tables que je n'ai plus
// qu'à copier coller pour refaire tout le projet" (reconstruire un nouveau
// projet Supabase vide à partir de zéro, en un seul copier-coller dans le
// SQL Editor, sans avoir à rejouer ~90 fichiers un par un).
//
// Vérifié avant d'écrire ce script : rejouer ces migrations dans l'ordre sur
// une base VRAIMENT fraîche (`supabase start`, stack Docker locale) a révélé
// 2 bugs réels (voir DECISIONS.md, 2026-07-17) -- la migration Spotify
// (`20260715000200`) et `seed.sql` référençaient tous les deux des éléments
// déjà retirés (`playlist_suggestions` jamais dans la publication realtime
// sur une base fraîche, table `waitlist` supprimée) -- corrigés avant que ce
// script n'existe.
//
// À relancer (`node scripts/build-full-schema.mjs`) après CHAQUE nouvelle
// migration ajoutée au projet, pour que `full-schema.sql` reste à jour.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const outputPath = path.join(process.cwd(), "supabase", "full-schema.sql");

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const header = `-- ============================================================
-- Konfeti -- schéma complet, généré automatiquement
-- ============================================================
-- Fichier généré par scripts/build-full-schema.mjs, concaténation de toutes
-- les migrations de supabase/migrations/ dans l'ordre chronologique.
-- NE PAS ÉDITER À LA MAIN -- toute modification doit se faire dans les
-- migrations d'origine, puis relancer ce script pour régénérer ce fichier.
--
-- Usage : coller l'intégralité de ce fichier dans le SQL Editor d'un projet
-- Supabase NEUF (base vide) pour reconstruire tout le schéma d'un coup.
-- Généré le ${new Date().toISOString().slice(0, 10)}, à partir de ${files.length} migrations.
-- ============================================================

`;

const body = files
  .map((file) => {
    const content = readFileSync(path.join(migrationsDir, file), "utf8");
    return `-- ============================================================\n-- Migration : ${file}\n-- ============================================================\n${content}`;
  })
  .join("\n");

writeFileSync(outputPath, header + body);
console.log(`Écrit ${outputPath} (${files.length} migrations concaténées).`);
