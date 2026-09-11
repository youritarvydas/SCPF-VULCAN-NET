let accountData = {
	roblox: null,
	discord: null
}

function setAvatar(element, account, fallback, type, loginUrl) {
	element.innerHTML = ""

	element.classList.remove(
		"roblox",
		"discord",
		"not-linked"
	)

	element.onclick = null
	element.style.cursor = "default"

	if (account && account.avatar) {
		const image = document.createElement("img")

		image.src = account.avatar
		image.alt = ""

		image.onerror = function () {
			element.innerHTML = `<span>${fallback}</span>`
			element.classList.add("not-linked")

			if (loginUrl) {
				element.style.cursor = "pointer"
				element.onclick = function () {
					window.location.href = loginUrl
				}
			}
		}

		element.appendChild(image)
		element.classList.add(type)
	} else {
		element.innerHTML = `<span>${fallback}</span>`
		element.classList.add("not-linked")

		element.style.cursor = "pointer"

		element.onclick = function () {
			window.location.href = loginUrl
		}
	}
}

function updateAccounts() {
	const robloxAvatar =
		document.getElementById("robloxAvatar")

	const discordAvatar =
		document.getElementById("discordAvatar")

	const robloxUsername =
		document.getElementById("robloxUsername")

	const robloxId =
		document.getElementById("robloxId")

	const discordUsername =
		document.getElementById("discordUsername")

	const discordId =
		document.getElementById("discordId")

	setAvatar(
		robloxAvatar,
		accountData.roblox,
		"R",
		"roblox",
		"/login/roblox"
	)

	setAvatar(
		discordAvatar,
		accountData.discord,
		"D",
		"discord",
		"/login/discord"
	)

	if (accountData.roblox) {
		robloxUsername.textContent =
			accountData.roblox.username

		robloxId.textContent =
			`ID: ${accountData.roblox.id}`
	} else {
		robloxUsername.textContent = "Not linked"
		robloxId.textContent = "No Roblox account linked"
	}

	if (accountData.discord) {
		discordUsername.textContent =
			accountData.discord.username

		discordId.textContent =
			`ID: ${accountData.discord.id}`
	} else {
		discordUsername.textContent = "Not linked"
		discordId.textContent = "No Discord account linked"
	}

	const linked =
		accountData.roblox &&
		accountData.discord

	const status =
		document.getElementById("connectionStatus")

	const icon =
		document.getElementById("connectionIcon")

	if (linked) {
		status.textContent = "ACCOUNTS LINKED"
		status.classList.remove("not-linked")

		icon.textContent = "🔗"
	} else {
		status.textContent = "NOT LINKED"
		status.classList.add("not-linked")

		icon.textContent = "×"
	}

	if (accountData.roblox) {
		document.getElementById("headerUsername").textContent =
			accountData.roblox.username

		document.querySelector(".Welcome h2").textContent =
			`Welcome back, ${accountData.roblox.username}.`

		document.getElementById("headerRank").textContent =
			"Foundation Personnel"

		const headerAvatar =
			document.getElementById("headerAvatar")

		if (headerAvatar && accountData.roblox.avatar) {
			headerAvatar.innerHTML = ""

			const image = document.createElement("img")

			image.src = accountData.roblox.avatar
			image.alt = ""

			headerAvatar.appendChild(image)
		}
	}
}

async function loadAccount() {
	try {
		const response = await fetch("/api/account")

		if (!response.ok) {
			window.location.href = "/"
			return
		}

		const data = await response.json()

		if (!data.loggedIn) {
			window.location.href = "/"
			return
		}

		accountData.roblox = data.roblox
		accountData.discord = data.discord

		updateAccounts()
	} catch (error) {
		console.error("Failed to load account:", error)
	}
}

function logout() {
	window.location.href = "/logout"
}

loadAccount()
