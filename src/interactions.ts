import type { Database } from 'better-sqlite3';
import {
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type Interaction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { AppConfig } from './config.js';
import { updateEventMessageId } from './db.js';
import {
  attachPlaceSuggestions,
  closeEventByCreator,
  createEventRecord,
  getEventDetail,
  listActiveEventsForGuild,
  setRsvp,
} from './events.js';
import { searchPlaces } from './places.js';
import { isEventKind, isParticipantStatus } from './types.js';
import {
  buildEventComponents,
  buildEventEmbed,
  buildEventListEmbed,
  buildHangoutKindSelect,
  buildHangoutModal,
  buildParticipantListEmbed,
  buildSpotEmbed,
} from './ui.js';
import { nowIso } from './utils/time.js';

export interface InteractionDeps {
  db: Database;
  cfg: AppConfig;
}

export async function handleInteraction(
  interaction: Interaction,
  deps: InteractionDeps,
): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      await handleChatInput(interaction, deps);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction, deps);
    } else if (interaction.isButton()) {
      await handleButton(interaction, deps);
    }
  } catch (err) {
    console.error('[interaction] unhandled error:', err);
    await safeReply(interaction, 'エラーが発生しました');
  }
}

async function safeReply(interaction: Interaction, content: string) {
  if (!interaction.isRepliable()) return;
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  } catch (err) {
    console.error('[interaction] safeReply failed:', err);
  }
}

// --- /command dispatch ---

async function handleChatInput(
  interaction: ChatInputCommandInteraction,
  deps: InteractionDeps,
): Promise<void> {
  switch (interaction.commandName) {
    case 'hangout':
      await interaction.reply({
        content: 'イベント種別を選んでください',
        components: [buildHangoutKindSelect()],
        ephemeral: true,
      });
      return;
    case 'events':
      await handleEventsList(interaction, deps);
      return;
    case 'spot':
      await handleSpot(interaction, deps);
      return;
    case 'event_close':
      await handleEventCloseCommand(interaction, deps);
      return;
    default:
      await interaction.reply({
        content: '未知のコマンドです',
        ephemeral: true,
      });
  }
}

async function handleEventsList(
  interaction: ChatInputCommandInteraction,
  deps: InteractionDeps,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: 'サーバー内で実行してください',
      ephemeral: true,
    });
    return;
  }
  const events = listActiveEventsForGuild(deps.db, interaction.guildId, 10);
  await interaction.reply({
    embeds: [buildEventListEmbed(events)],
    ephemeral: true,
  });
}

async function handleSpot(
  interaction: ChatInputCommandInteraction,
  deps: InteractionDeps,
): Promise<void> {
  const kind = interaction.options.getString('kind', true);
  if (kind !== 'meal' && kind !== 'drink') {
    await interaction.reply({
      content: '不正な種別です',
      ephemeral: true,
    });
    return;
  }
  // Places API 呼び出しが3秒を超える可能性があるので defer
  await interaction.deferReply({ ephemeral: true });
  const candidates = await searchPlaces(deps.db, kind, null, deps.cfg);
  await interaction.editReply({ embeds: [buildSpotEmbed(candidates, kind)] });
}

async function handleEventCloseCommand(
  interaction: ChatInputCommandInteraction,
  deps: InteractionDeps,
): Promise<void> {
  const eventId = interaction.options.getString('event_id', true).trim();
  const result = closeEventByCreator(deps.db, eventId, interaction.user.id);
  if (!result.ok) {
    const msg =
      result.reason === 'not_found'
        ? `イベント \`${eventId}\` が見つかりません`
        : result.reason === 'forbidden'
          ? '作成者だけが閉じられます'
          : '既に閉じています';
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  await refreshEventMessage(interaction.client, deps, eventId);
  await interaction.editReply({
    content: `イベント \`${eventId}\` を閉じました`,
  });
}

// --- SelectMenu (種別選択 → Modal) ---

async function handleSelectMenu(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (interaction.customId !== 'hangout:kind') return;
  const value = interaction.values[0] ?? '';
  if (!isEventKind(value)) {
    await interaction.reply({ content: '不正な選択肢です', ephemeral: true });
    return;
  }
  // showModal は3秒以内・defer不可
  await interaction.showModal(buildHangoutModal(value));
}

// --- ModalSubmit (イベント作成) ---

async function handleModalSubmit(
  interaction: ModalSubmitInteraction,
  deps: InteractionDeps,
): Promise<void> {
  if (!interaction.customId.startsWith('hangout_modal:')) return;
  const kindRaw = interaction.customId.split(':')[1] ?? '';
  if (!isEventKind(kindRaw)) {
    await interaction.reply({
      content: '不正なモーダルです',
      ephemeral: true,
    });
    return;
  }
  const kind = kindRaw;

  if (
    !interaction.inGuild() ||
    !interaction.channelId ||
    !interaction.channel ||
    interaction.channel.isDMBased()
  ) {
    await interaction.reply({
      content: 'サーバーのテキストチャンネルで実行してください',
      ephemeral: true,
    });
    return;
  }

  // Places API 呼び出し・channel.send があるので defer する
  await interaction.deferReply({ ephemeral: true });

  const title = interaction.fields.getTextInputValue('title').trim();
  const startText = interaction.fields.getTextInputValue('start_text').trim();
  const meetupText = readOptionalField(interaction, 'meetup_text');
  const note = readOptionalField(interaction, 'note');
  const placeRequest = readOptionalField(interaction, 'place_request');

  const event = createEventRecord(deps.db, {
    kind,
    title,
    startText,
    meetupText,
    note,
    placeRequest,
    createdBy: interaction.user.id,
    createdByName: getDisplayName(interaction),
    guildId: interaction.guildId,
    channelId: interaction.channelId,
  });

  if (kind === 'meal' || kind === 'drink') {
    try {
      const candidates = await searchPlaces(
        deps.db,
        kind,
        placeRequest,
        deps.cfg,
      );
      attachPlaceSuggestions(deps.db, event.id, candidates);
    } catch (err) {
      console.error('[hangout] place search failed:', err);
    }
  }

  // 作成者は自動で going にする
  setRsvp(
    deps.db,
    event.id,
    interaction.user.id,
    getDisplayName(interaction),
    'going',
  );

  const detail = getEventDetail(deps.db, event.id);
  if (!detail) {
    await interaction.editReply({ content: 'イベント保存に失敗しました' });
    return;
  }

  const channel = interaction.channel;
  if (!('send' in channel) || typeof channel.send !== 'function') {
    await interaction.editReply({
      content: 'このチャンネルには投稿できません',
    });
    return;
  }

  const msg = await channel.send({
    embeds: [
      buildEventEmbed(detail.event, detail.participants, detail.places),
    ],
    components: buildEventComponents(detail.event),
  });

  updateEventMessageId(deps.db, event.id, msg.id, nowIso());

  const link = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${msg.id}`;
  await interaction.editReply({
    content: `イベントを作成しました（id: \`${event.id}\`）\n${link}`,
  });
}

function readOptionalField(
  interaction: ModalSubmitInteraction,
  customId: string,
): string | null {
  try {
    const value = interaction.fields.getTextInputValue(customId).trim();
    return value.length > 0 ? value : null;
  } catch {
    // Modal にそのフィールドが含まれていない場合
    return null;
  }
}

function getDisplayName(
  interaction: ModalSubmitInteraction | ButtonInteraction,
): string {
  const member = interaction.member;
  if (
    member &&
    'displayName' in member &&
    typeof member.displayName === 'string' &&
    member.displayName.length > 0
  ) {
    return member.displayName;
  }
  return interaction.user.displayName ?? interaction.user.username;
}

// --- Button (rsvp / list / close / reroll) ---

async function handleButton(
  interaction: ButtonInteraction,
  deps: InteractionDeps,
): Promise<void> {
  const parts = interaction.customId.split(':');
  const action = parts[0] ?? '';
  const eventId = parts[1] ?? '';

  switch (action) {
    case 'rsvp':
      await handleRsvpButton(interaction, deps, eventId, parts[2] ?? '');
      return;
    case 'list':
      await handleListButton(interaction, deps, eventId);
      return;
    case 'close':
      await handleCloseButton(interaction, deps, eventId);
      return;
    case 'reroll':
      // custom_id 規約として予約のみ。MVP では未実装。
      await interaction.reply({
        content: 'reroll は未実装です',
        ephemeral: true,
      });
      return;
    default:
      await interaction.reply({
        content: '不明な操作です',
        ephemeral: true,
      });
  }
}

async function handleRsvpButton(
  interaction: ButtonInteraction,
  deps: InteractionDeps,
  eventId: string,
  rawStatus: string,
): Promise<void> {
  if (!isParticipantStatus(rawStatus)) {
    await interaction.reply({ content: '不正な操作です', ephemeral: true });
    return;
  }
  const detail = getEventDetail(deps.db, eventId);
  if (!detail) {
    await interaction.reply({
      content: 'イベントが見つかりません',
      ephemeral: true,
    });
    return;
  }
  if (detail.event.status === 'closed') {
    await interaction.reply({
      content: 'このイベントは既に閉じています',
      ephemeral: true,
    });
    return;
  }
  if (rawStatus === 'softdrink' && detail.event.kind !== 'drink') {
    await interaction.reply({
      content: 'このイベントは飲みではありません',
      ephemeral: true,
    });
    return;
  }

  setRsvp(
    deps.db,
    eventId,
    interaction.user.id,
    getDisplayName(interaction),
    rawStatus,
  );

  const updated = getEventDetail(deps.db, eventId);
  if (!updated) return;
  await interaction.update({
    embeds: [
      buildEventEmbed(updated.event, updated.participants, updated.places),
    ],
    components: buildEventComponents(updated.event),
  });
}

async function handleListButton(
  interaction: ButtonInteraction,
  deps: InteractionDeps,
  eventId: string,
): Promise<void> {
  const detail = getEventDetail(deps.db, eventId);
  if (!detail) {
    await interaction.reply({
      content: 'イベントが見つかりません',
      ephemeral: true,
    });
    return;
  }
  await interaction.reply({
    embeds: [buildParticipantListEmbed(detail.event, detail.participants)],
    ephemeral: true,
  });
}

async function handleCloseButton(
  interaction: ButtonInteraction,
  deps: InteractionDeps,
  eventId: string,
): Promise<void> {
  const detail = getEventDetail(deps.db, eventId);
  if (!detail) {
    await interaction.reply({
      content: 'イベントが見つかりません',
      ephemeral: true,
    });
    return;
  }
  if (detail.event.createdBy !== interaction.user.id) {
    await interaction.reply({
      content: '作成者だけが閉じられます',
      ephemeral: true,
    });
    return;
  }
  if (detail.event.status === 'closed') {
    await interaction.reply({
      content: '既に閉じています',
      ephemeral: true,
    });
    return;
  }

  const result = closeEventByCreator(deps.db, eventId, interaction.user.id);
  if (!result.ok || !result.event) {
    await interaction.reply({
      content: '閉じられませんでした',
      ephemeral: true,
    });
    return;
  }
  const updated = getEventDetail(deps.db, eventId);
  if (!updated) return;
  await interaction.update({
    embeds: [
      buildEventEmbed(updated.event, updated.participants, updated.places),
    ],
    components: buildEventComponents(updated.event),
  });
}

// --- Helpers ---

async function refreshEventMessage(
  client: Client,
  deps: InteractionDeps,
  eventId: string,
): Promise<void> {
  const detail = getEventDetail(deps.db, eventId);
  if (!detail || !detail.event.messageId) return;
  try {
    const channel = await client.channels.fetch(detail.event.channelId);
    if (
      !channel ||
      !channel.isTextBased() ||
      channel.isDMBased() ||
      !('messages' in channel)
    ) {
      return;
    }
    const msg = await channel.messages.fetch(detail.event.messageId);
    await msg.edit({
      embeds: [
        buildEventEmbed(detail.event, detail.participants, detail.places),
      ],
      components: buildEventComponents(detail.event),
    });
  } catch (err) {
    console.error('[interaction] refreshEventMessage failed:', err);
  }
}
