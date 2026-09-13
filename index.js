require("dotenv").config()

const express = require("express")
const crypto = require("crypto")
const session = require("express-session")

const discordConnect = require("./DiscordConnect")
const discordBot = require("./Discordbot")
const { sendDirectMessage } = discordBot

const {
	linkAccounts,
	getLinkByRobloxId
} = require("./accountStore")

const app = express()

const PORT = process.env.PORT || 3000
const CLIENT_ID = process.env.ROBLOX_CLIENT_ID
const CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET

const REDIRECT_URI =
	"https://scpf-vulcan-net20-production.up.railway.app/oauth/callback"

const SESSION_SECRET = process.env.SESSION_SECRET

if (!SESSION_SECRET) {
	throw new Error("SESSION_SECRET is not configured in Railway.")
}

app.set("trust proxy", 1)

app.use(express.static("public"))
app.use(express.json())

app.use(
	session({
		name: "spas.sid",
		secret: SESSION_SECRET,
		resave: false,
		saveUninitialized: false,
		cookie: {
			httpOnly: true,
			secure: true,
			sameSite: "lax",
			maxAge: 1000 * 60 * 60
		}
	})
)

app.use(discordConnect)

console.log("Database initialized.")

app.get("/login/roblox", (req, res) => {
const state = crypto.randomBytes(32).toString("hex")


req.session.oauthState = state

req.session.save((err) => {
	if (err) {
		console.error("Failed to save OAuth session:", err)
		return res.status(500).send("Failed to initialize OAuth session.")
	}

	const params = new URLSearchParams({
		client_id: CLIENT_ID,
		redirect_uri: REDIRECT_URI,
		scope: "openid profile",
		response_type: "code",
		state: state
	})

	const authorizationUrl =
		`https://apis.roblox.com/oauth/v1/authorize?${params.toString()}`

	res.redirect(authorizationUrl)
})


})

app.get("/oauth/callback", async (req, res) => {
const {
code,
state,
error,
error_description
} = req.query


if (error) {
	return res.status(400).send(`
		<h1>OAuth Error</h1>
		<p>${error}</p>
		<p>${error_description || ""}</p>
	`)
}

if (!code) {
	return res.status(400).send("Missing authorization code.")
}

if (!state) {
	return res.status(400).send("Missing OAuth state.")
}

if (!req.session.oauthState) {
	console.error("OAuth state missing from session.")
	console.error("Received state:", state)

	return res.status(400).send("OAuth session expired or was lost.")
}

if (state !== req.session.oauthState) {
	console.error("OAuth state mismatch.")
	console.error("Expected:", req.session.oauthState)
	console.error("Received:", state)

	return res.status(400).send("Invalid OAuth state.")
}

delete req.session.oauthState

try {
	const body = new URLSearchParams({
		client_id: CLIENT_ID,
		client_secret: CLIENT_SECRET,
		grant_type: "authorization_code",
		code: code,
		redirect_uri: REDIRECT_URI
	})

	const tokenResponse = await fetch(
		"https://apis.roblox.com/oauth/v1/token",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded"
			},
			body: body.toString()
		}
	)

	const tokens = await tokenResponse.json()

	if (!tokenResponse.ok) {
		console.error("Roblox token error:", tokens)
		return res.status(400).json(tokens)
	}

	const userResponse = await fetch(
		"https://apis.roblox.com/oauth/v1/userinfo",
		{
			headers: {
				Authorization: `Bearer ${tokens.access_token}`
			}
		}
	)

	const user = await userResponse.json()

	if (!userResponse.ok) {
		console.error("Roblox userinfo error:", user)
		return res.status(400).json(user)
	}

	console.log("Roblox user:", user)

	req.session.roblox = {
		id: user.sub,
		username: user.preferred_username,
		displayName: user.name,
		avatar: user.picture
	}

	req.session.accessToken = tokens.access_token

	if (req.session.discord) {
		linkAccounts(
			req.session.roblox,
			req.session.discord
		)
	}

	req.session.save((err) => {
		if (err) {
			console.error("Failed to save Roblox session:", err)
			return res.status(500).send("Failed to save login session.")
		}

		res.redirect("/Dashboard.html")
	})
} catch (error) {
	console.error("Roblox OAuth callback error:", error)
	res.status(500).send("Internal server error.")
}


})

app.get("/api/account", (req, res) => {
if (!req.session.roblox && !req.session.discord) {
return res.status(401).json({
loggedIn: false
})
}


res.json({
	loggedIn: true,
	roblox: req.session.roblox || null,
	discord: req.session.discord || null
})


})

app.get("/api/roblox/:playerId/discord", (req, res) => {
const link = getLinkByRobloxId(req.params.playerId)


if (!link) {
	return res.status(404).json({
		error: "No Discord account is linked to this Roblox player."
	})
}

res.json({
	robloxId: link.roblox_id,
	discordId: link.discord_id,
	discordUsername: link.discord_username,
	linkedAt: link.linked_at
})


})

app.post("/api/roblox/:playerId/send", async (req, res) => {
const configuredApiKey = process.env.ROBLOX_API_KEY
const providedApiKey = req.get("x-api-key")


if (!configuredApiKey) {
	return res.status(503).json({
		error: "ROBLOX_API_KEY is not configured."
	})
}

if (!providedApiKey || providedApiKey !== configuredApiKey) {
	return res.status(401).json({
		error: "Invalid API key."
	})
}

if (!discordBot.isReady()) {
	return res.status(503).json({
		error: "Discord bot is not ready."
	})
}

const link = getLinkByRobloxId(req.params.playerId)

const content = req.body && req.body.content
const embed = req.body && req.body.embed

if (!link) {
	return res.status(404).json({
		error: "No Discord account is linked to this Roblox player."
	})
}

if (
	content !== undefined &&
	(typeof content !== "string" || content.length > 2000)
) {
	return res.status(400).json({
		error: "Content must be a string of 2000 characters or less."
	})
}

if (
	embed &&
	(typeof embed !== "object" || Array.isArray(embed))
) {
	return res.status(400).json({
		error: "embed must be a JSON object."
	})
}

if ((!content || content.length === 0) && !embed) {
	return res.status(400).json({
		error: "Send content, an embed, or both."
	})
}

if (embed && JSON.stringify(embed).length > 6000) {
	return res.status(400).json({
		error: "The embed is too large."
	})
}

try {
	await sendDirectMessage(link.discord_id, {
		...(content ? { content } : {}),
		...(embed ? { embeds: [embed] } : {})
	})

	res.json({
		sent: true,
		robloxId: link.roblox_id,
		discordId: link.discord_id
	})
} catch (error) {
	console.error(
		"Failed to send Discord message:",
		error
	)

	if (error.code === 50007) {
		return res.status(409).json({
			error:
				"Discord cannot DM this user because the bot has no mutual server with them.",
			discordCode: error.code,
			nextStep:
				"Invite this bot account to the server where the Discord user is a member."
		})
	}

	res.status(502).json({
		error: "Discord message could not be sent."
	})
}


})

app.get("/logout", (req, res) => {
req.session.destroy((err) => {
if (err) {
console.error("Failed to destroy session:", err)
}


	res.clearCookie("spas.sid")
	res.redirect("/")
})

})

app.listen(PORT, () => {
console.log(
`Server running at https://scpf-vulcan-net20-production.up.railway.app/`
)

console.log(
	`OAuth callback: ${REDIRECT_URI}`
)

})
