const crypto = require("crypto")
const express = require("express")
const { linkAccounts } = require("./accountStore")

const router = express.Router()

const CLIENT_ID = process.env.DISCORD_CLIENT_ID

const CLIENT_SECRET =
	process.env.DISCORD_CLIENT_SECRET ||
	process.env.DISCORD_SECRET_ID

const REDIRECT_URI =
	"https://scpf-vulcan-net.onrender.com/oauth/discord/callback"

const DISCORD_API = "https://discord.com/api/v10"

function escapeHtml(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;")
}

router.get("/login/discord", (req, res) => {
	if (!CLIENT_ID || !CLIENT_SECRET) {
		console.error("Discord OAuth credentials are missing.")

		return res.status(500).send(
			"Discord OAuth is not configured correctly."
		)
	}

	if (req.session.discordOauthInProgress) {
		return res.redirect("/Dashboard.html")
	}

	const state = crypto.randomBytes(32).toString("hex")

	req.session.discordOauthState = state
	req.session.discordOauthInProgress = true

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
			state
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

	const clearOAuthState = () => {
		delete req.session.discordOauthState
		delete req.session.discordOauthInProgress
	}

	if (error) {
		console.error(
			"Discord OAuth authorization error:",
			error,
			error_description
		)

		clearOAuthState()

		return req.session.save(() => {
			res.status(400).send(`
				<h1>Discord OAuth Error</h1>
				<p>${escapeHtml(error)}</p>
				<p>${escapeHtml(error_description || "")}</p>
			`)
		})
	}

	if (!code) {
		clearOAuthState()

		return req.session.save(() => {
			res.status(400).send(
				"Missing authorization code."
			)
		})
	}

	if (!state) {
		clearOAuthState()

		return req.session.save(() => {
			res.status(400).send(
				"Missing OAuth state."
			)
		})
	}

	if (!req.session.discordOauthState) {
		console.error(
			"Discord OAuth state missing from session."
		)

		clearOAuthState()

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

		clearOAuthState()

		return req.session.save(() => {
			res.status(400).send(
				"Invalid Discord OAuth state."
			)
		})
	}

	clearOAuthState()

	try {
		if (!CLIENT_ID) {
			console.error(
				"DISCORD_CLIENT_ID is missing."
			)

			return res.status(500).send(
				"Discord Client ID is not configured."
			)
		}

		if (!CLIENT_SECRET) {
			console.error(
				"DISCORD_CLIENT_SECRET is missing."
			)

			return res.status(500).send(
				"Discord Client Secret is not configured."
			)
		}

		const credentials = Buffer
			.from(`${CLIENT_ID}:${CLIENT_SECRET}`)
			.toString("base64")

		const body = new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: REDIRECT_URI
		})

		console.log(
			"Requesting Discord OAuth token..."
		)

		const tokenResponse = await fetch(
			`${DISCORD_API}/oauth2/token`,
			{
				method: "POST",
				headers: {
					"Content-Type":
						"application/x-www-form-urlencoded",
					"Authorization":
						`Basic ${credentials}`
				},
				body: body.toString()
			}
		)

		const tokenText =
			await tokenResponse.text()

		console.log(
			"Discord token response status:",
			tokenResponse.status
		)

		console.log(
			"Discord token response content-type:",
			tokenResponse.headers.get(
				"content-type"
			)
		)

		if (tokenResponse.status === 429) {
			const retryAfter =
				tokenResponse.headers.get(
					"retry-after"
				)

			console.error(
				"Discord token endpoint is rate-limiting this server."
			)

			console.error(
				"Retry-After:",
				retryAfter
			)

			return res.status(429).send(`
				<h1>Discord temporarily rate-limited the server</h1>
				<p>Discord is currently blocking OAuth token requests from this server.</p>
				${
					retryAfter
						? `<p>Retry-After: ${escapeHtml(retryAfter)} seconds.</p>`
						: ""
				}
				<p>Please wait before trying again.</p>
			`)
		}

		if (!tokenResponse.ok) {
			console.error(
				"Discord token response:",
				tokenText
			)

			return res.status(400).send(`
				<h1>Discord Token Error</h1>
				<p>Status: ${tokenResponse.status}</p>
				<pre>${escapeHtml(tokenText)}</pre>
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

		console.log(
			"Discord OAuth token received successfully."
		)

		const userResponse = await fetch(
			`${DISCORD_API}/users/@me`,
			{
				method: "GET",
				headers: {
					Authorization:
						`Bearer ${tokens.access_token}`
				}
			}
		)

		const userText =
			await userResponse.text()

		console.log(
			"Discord user response status:",
			userResponse.status
		)

		console.log(
			"Discord user response content-type:",
			userResponse.headers.get(
				"content-type"
			)
		)

		if (userResponse.status === 429) {
			console.error(
				"Discord user endpoint is rate-limiting this server."
			)

			return res.status(429).send(
				"Discord temporarily rate-limited the server. Please try again later."
			)
		}

		if (!userResponse.ok) {
			console.error(
				"Discord user response:",
				userText
			)

			return res.status(400).send(`
				<h1>Discord User Error</h1>
				<p>Status: ${userResponse.status}</p>
				<pre>${escapeHtml(userText)}</pre>
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
			try {
				linkAccounts(
					req.session.roblox,
					req.session.discord
				)

				console.log(
					"Roblox and Discord accounts linked:",
					req.session.roblox.id,
					req.session.discord.id
				)
			} catch (error) {
				console.error(
					"Failed to link Roblox and Discord accounts:",
					error
				)

				return res.status(500).send(
					"Discord login succeeded, but the accounts could not be linked."
				)
			}
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

		clearOAuthState()

		req.session.save(() => {
			res.status(500).send(
				"Internal server error."
			)
		})
	}
})

module.exports = router

