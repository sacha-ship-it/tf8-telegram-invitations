const TelegramBot = require('node-telegram-bot-api')

const TOKEN = process.env.TOKEN
const GROUP_ID = process.env.GROUP_ID

const bot = new TelegramBot(TOKEN, { polling: true })

const inviteLinks = new Map() // userId -> { link, count }
const inviteCount = new Map() // userId -> { count, username }
let dataMessageId = null

// ─────────────────────────────────────────
// SAUVEGARDER LES DONNÉES
// ─────────────────────────────────────────

async function saveData() {
  try {
    const data = JSON.stringify({
      inviteLinks: Object.fromEntries(inviteLinks),
      inviteCount: Object.fromEntries(inviteCount)
    })

    if (dataMessageId) {
      await bot.editMessageText('TFDATA:' + data, {
        chat_id: GROUP_ID,
        message_id: dataMessageId
      })
    } else {
      const msg = await bot.sendMessage(GROUP_ID, 'TFDATA:' + data)
      dataMessageId = msg.message_id
    }
  } catch (e) {
    console.error('Erreur sauvegarde:', e.message)
  }
}

async function loadData() {
  try {
    const messages = await bot.getUpdates({ limit: 100 })
    // Les données sont sauvegardées dans un message du bot dans le groupe
    console.log('Bot démarré, données en mémoire')
  } catch (e) {
    console.log('Pas de données existantes')
  }
}

// ─────────────────────────────────────────
// COMMANDES
// ─────────────────────────────────────────

// /monlien → génère un lien d'invitation unique
bot.onText(/\/monlien/, async (msg) => {
  const userId = msg.from.id
  const username = msg.from.username || msg.from.first_name

  // Vérifier si le membre a déjà un lien
  if (inviteLinks.has(userId)) {
    const existing = inviteLinks.get(userId)
    return bot.sendMessage(msg.chat.id,
      `🔗 Ton lien d'invitation personnel :\n${existing.link}\n\nPartage-le pour grimper dans le classement !`,
      { reply_to_message_id: msg.message_id }
    )
  }

  try {
    // Créer un lien d'invitation unique
    const invite = await bot.createChatInviteLink(GROUP_ID, {
      name: `Invite de ${username}`,
      creates_join_request: false,
      member_limit: 999
    })

    inviteLinks.set(userId, {
      link: invite.invite_link,
      username,
      inviteCode: invite.invite_link.split('/').pop()
    })

    if (!inviteCount.has(userId)) {
      inviteCount.set(userId, { count: 0, username })
    }

    await saveData()

    bot.sendMessage(msg.chat.id,
      `🔗 Ton lien d'invitation personnel :\n${invite.invite_link}\n\nPartage-le autour de toi et grimpe dans le classement 🏆`,
      { reply_to_message_id: msg.message_id }
    )
  } catch (e) {
    console.error('Erreur création lien:', e.message)
    bot.sendMessage(msg.chat.id, '❌ Erreur lors de la création du lien. Réessaie.', {
      reply_to_message_id: msg.message_id
    })
  }
})

// /mesinfos → voir ses stats
bot.onText(/\/mesinfos/, (msg) => {
  const userId = msg.from.id
  const data = inviteCount.get(userId)
  const count = data ? data.count : 0

  bot.sendMessage(msg.chat.id,
    `📊 Tes invitations : *${count} membre${count > 1 ? 's' : ''}* invité${count > 1 ? 's' : ''}\n\nContinue pour grimper dans le classement 🏆`,
    { parse_mode: 'Markdown', reply_to_message_id: msg.message_id }
  )
})

// /classement → top 10
bot.onText(/\/classement/, (msg) => {
  const top = [...inviteCount.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)

  if (top.length === 0) {
    return bot.sendMessage(msg.chat.id, 'Aucune invitation pour le moment.')
  }

  const medals = ['🥇', '🥈', '🥉']
  const classement = top.map(([id, data], i) => {
    const rank = medals[i] || `${i + 1}.`
    return `${rank} @${data.username} : *${data.count} invitation${data.count > 1 ? 's' : ''}*`
  }).join('\n')

  bot.sendMessage(msg.chat.id,
    `🏆 *CLASSEMENT DES INVITATIONS*\n\n${classement}`,
    { parse_mode: 'Markdown' }
  )
})

// Détecter les nouveaux membres
bot.on('new_chat_members', async (msg) => {
  const newMembers = msg.new_chat_members
  const inviteLink = msg.invite_link

  if (!inviteLink) return

  const inviteCode = inviteLink.invite_link?.split('/').pop()

  // Trouver qui a créé ce lien
  for (const [userId, data] of inviteLinks.entries()) {
    if (data.inviteCode === inviteCode) {
      const current = inviteCount.get(userId) || { count: 0, username: data.username }
      inviteCount.set(userId, {
        count: current.count + newMembers.length,
        username: data.username
      })
      await saveData()

      bot.sendMessage(GROUP_ID,
        `📨 *${newMembers.map(m => m.first_name).join(', ')}* ${newMembers.length > 1 ? 'ont' : 'a'} rejoint via le lien de *@${data.username}* — Total : *${current.count + newMembers.length} invitations*`,
        { parse_mode: 'Markdown' }
      )
      break
    }
  }
})

// ─────────────────────────────────────────
// DÉMARRAGE
// ─────────────────────────────────────────

loadData()
console.log('Bot TF8 Invitations Telegram démarré !')
