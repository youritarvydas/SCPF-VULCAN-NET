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

```
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

	res.redirect(
		`https://discord.com/oauth2/authorize?${params.toString()}`
	)
})
```

})

router.get("/oauth/discord/callback", async (req, res) => {
const {
code,
state,
error,
error_description
} = req.query

```
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

	console.error(
		"Received state:",
		state
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

	const tokens = await tokenResponse.json()

	if (!tokenResponse.ok) {
		console.error(
			"Discord token error:",
			tokens
		)

		return res.status(400).json(tokens)
	}

	const userResponse = await fetch(
		"https://discord.com/api/users/@me",
		{
			headers: {
				Authorization:
					`Bearer ${tokens.access_token}`
			}
		}
	)

	const user = await userResponse.json()

	if (!userResponse.ok) {
		console.error(
			"Discord user error:",
			user
		)

		return res.status(400).json(user)
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
```

})

module.exports = router
