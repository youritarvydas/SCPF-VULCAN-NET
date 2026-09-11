const fs = require("fs")
const path = require("path")
const Database = require("better-sqlite3")

const dataDirectory = path.join(__dirname, "data")
fs.mkdirSync(dataDirectory, { recursive: true })

const database = new Database(path.join(dataDirectory, "accounts.db"))

database.exec(`
	CREATE TABLE IF NOT EXISTS account_links (
		roblox_id TEXT PRIMARY KEY,
		roblox_username TEXT NOT NULL,
		discord_id TEXT NOT NULL UNIQUE,
		discord_username TEXT NOT NULL,
		linked_at TEXT NOT NULL
	)
`)

const saveLink = database.prepare(`
	INSERT INTO account_links (
		roblox_id,
		roblox_username,
		discord_id,
		discord_username,
		linked_at
	) VALUES (?, ?, ?, ?, ?)
	ON CONFLICT(roblox_id) DO UPDATE SET
		roblox_username = excluded.roblox_username,
		discord_id = excluded.discord_id,
		discord_username = excluded.discord_username,
		linked_at = excluded.linked_at
`)

const findByRobloxId = database.prepare(`
	SELECT roblox_id, roblox_username, discord_id, discord_username, linked_at
	FROM account_links
	WHERE roblox_id = ?
`)

function linkAccounts(roblox, discord) {
	saveLink.run(
		String(roblox.id),
		roblox.username,
		String(discord.id),
		discord.username,
		new Date().toISOString()
	)
}

function getLinkByRobloxId(robloxId) {
	return findByRobloxId.get(String(robloxId))
}

module.exports = {
	linkAccounts,
	getLinkByRobloxId
}
