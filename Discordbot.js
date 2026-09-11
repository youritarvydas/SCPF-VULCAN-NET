require("dotenv").config()

const {
	Client,
	GatewayIntentBits,
	Events,
	ActivityType
} = require("discord.js")

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds
	]
})

client.once(Events.ClientReady, client => {
	console.log(`Discord bot logged in as ${client.user.tag}`)
})

client.on(Events.Error, error => {
	console.error("Discord client error:", error)
})

async function sendDirectMessage(discordUserId, message) {
	console.log("Attempting Discord DM:", discordUserId)

	const discordUser = await client.users.fetch(String(discordUserId))

	console.log(
		`Fetched Discord user: ${discordUser.tag} (${discordUser.id})`
	)

	const sentMessage = await discordUser.send(message)

	console.log(
		`Discord DM sent successfully: ${sentMessage.id}`
	)

	return sentMessage
}

client.login(process.env.DISCORD_TOKEN).catch(error => {
	console.error("Discord login failed:", error.message)
})

client.once(Events.ClientReady, client => {
	console.log(`Discord bot logged in as ${client.user.tag}`)

	client.user.setPresence({
		status: "online",
		activities: [
			{
				name: process.env.DISCORD_STATUS || "the mainframe",
				type: ActivityType.Watching
			}
		]
	})

	console.log("Bot guilds:")

	for (const guild of client.guilds.cache.values()) {
		console.log(`- ${guild.name} (${guild.id})`)
	}
})

module.exports = client
module.exports.sendDirectMessage = sendDirectMessage