const crypto = require("crypto")
const express = require("express")
const { linkAccounts } = require("./accountStore")

const router = express.Router()

const CLIENT_ID = process.env.DISCORD_CLIENT_ID
const CLIENT_SECRET =
process.env.DISCORD_CLIENT_SECRET || process.env.DISCORD_SECRET_ID

const REDIRECT_URI =
"https://scpf-vulcan-net.onrender.com/oauth/discord/callback"

router.get("/login/discord", (req, res) => {
const state = crypto.randomBytes(32).toString("hex")


req.session.discordOauthState = state

req.session.save((err) => {
	if (err) {
		console.error(
			"Failed to save Discord OAuth session:",
			err
		)

		return res.status(500).send(
			"Failed to initialize Discord OAuth session."
		)
	}

	const params = new URLSearchParams({
		client_id: CLIENT_ID,
		response_type: "code",
		redirect_uri: REDIRECT_URI,
		scope: "identify",
		state: state
	})

	const authorizationUrl =
		"https://discord.com/oauth2/authorize?" +
		params.toString()

	res.redirect(authorizationUrl)
})


})

router.get("/oauth/discord/callback", async (req, res) => {
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
	return res.status(400).send(
		"Missing authorization code."
	)
}

if (!state) {
	return res.status(400).send(
		"Missing OAuth state."
	)
}

if (!req.session.discordOauthState) {
	console.error(
		"Discord OAuth state missing from session."
	)

	return res.status(400).send(
		"Discord OAuth session expired or was lost."
	)
}

if (state !== req.session.discordOauthState) {
	console.error(
		"Discord OAuth state mismatch."
	)

	console.error(
		"Expected:",
		req.session.discordOauthState
	)

	console.error(
		"Received:",
		state
	)

	return res.status(400).send(
		"Invalid Discord OAuth state."
	)
}

delete req.session.discordOauthState

try {
	if (!CLIENT_ID) {
		console.error("DISCORD_CLIENT_ID is missing.")
		return res.status(500).send(
			"Discord Client ID is not configured."
		)
	}

	if (!CLIENT_SECRET) {
		console.error("DISCORD_CLIENT_SECRET is missing.")
		return res.status(500).send(
			"Discord Client Secret is not configured."
		)
	}

	const body = new URLSearchParams({
		client_id: CLIENT_ID,
		client_secret: CLIENT_SECRET,
		grant_type: "authorization_code",
		code: code,
		redirect_uri: REDIRECT_URI
	})

	const tokenResponse = await fetch(
		"https://discord.com/api/oauth2/token",
		{
			method: "POST",
			headers: {
				"Content-Type":
					"application/x-www-form-urlencoded"
			},
			body: body.toString()
		}
	)

	const tokenText = await tokenResponse.text()

	console.log(
		"Discord token response status:",
		tokenResponse.status
	)

	console.log(
		"Discord token response content-type:",
		tokenResponse.headers.get("content-type")
	)

	if (!tokenResponse.ok) {
		console.error(
			"Discord token response:",
			tokenText
		)

		return res.status(400).send(`
			<h1>Discord Token Error</h1>
			<p>Status: ${tokenResponse.status}</p>
			<pre>${tokenText}</pre>
		`)
	}

	let tokens

	try {
		tokens = JSON.parse(tokenText)
	} catch (error) {
		console.error(
			"Discord returned invalid token response:",
			tokenText
		)

		return res.status(502).send(
			"Discord returned an invalid token response."
		)
	}

	if (!tokens.access_token) {
		console.error(
			"Discord token response has no access token:",
			tokens
		)

		return res.status(400).json({
			error:
				"Discord did not return an access token.",
			response: tokens
		})
	}

	const userResponse = await fetch(
		"https://discord.com/api/users/@me",
		{
			method: "GET",
			headers: {
				Authorization:
					`Bearer ${tokens.access_token}`
			}
		}
	)

	const userText = await userResponse.text()

	console.log(
		"Discord user response status:",
		userResponse.status
	)

	console.log(
		"Discord user response content-type:",
		userResponse.headers.get("content-type")
	)

	if (!userResponse.ok) {
		console.error(
			"Discord user response:",
			userText
		)

		return res.status(400).send(`
			<h1>Discord User Error</h1>
			<p>Status: ${userResponse.status}</p>
			<pre>${userText}</pre>
		`)
	}

	let user

	try {
		user = JSON.parse(userText)
	} catch (error) {
		console.error(
			"Discord returned invalid user response:",
			userText
		)

		return res.status(502).send(
			"Discord returned an invalid user response."
		)
	}

	console.log(
		"Discord user:",
		user
	)

	req.session.discord = {
		id: user.id,
		username:
			user.global_name ||
			user.username,
		avatar: user.avatar
			? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
			: null
	}

	if (req.session.roblox) {
		linkAccounts(
			req.session.roblox,
			req.session.discord
		)
	}

	req.session.save((err) => {
		if (err) {
			console.error(
				"Failed to save Discord session:",
				err
			)

			return res.status(500).send(
				"Failed to save login session."
			)
		}

		res.redirect("/Dashboard.html")
	})
} catch (error) {
	console.error(
		"Discord OAuth callback error:",
		error
	)

	res.status(500).send(
		"Internal server error."
	)
}

})

module.exports = router
