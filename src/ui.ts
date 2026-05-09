import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  DRINK_WARNING,
  KIND_EMOJIS,
  KIND_LABELS,
  type EventKind,
  type EventRow,
  type ParticipantRow,
  type PlaceCandidate,
  type PlaceSuggestionRow,
} from './types.js';

const COLOR_BY_KIND: Record<EventKind, number> = {
  school: 0x3498db,
  outside: 0x2ecc71,
  meal: 0xf1c40f,
  drink: 0xe67e22,
};
const COLOR_CLOSED = 0x95a5a6;
const COLOR_LIST = 0x5865f2;

// --- /hangout: 種別選択 SelectMenu ---

export function buildHangoutKindSelect(): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('hangout:kind')
    .setPlaceholder('イベント種別を選択')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('校舎内')
        .setValue('school')
        .setEmoji('🏫'),
      new StringSelectMenuOptionBuilder()
        .setLabel('校舎外')
        .setValue('outside')
        .setEmoji('🚶'),
      new StringSelectMenuOptionBuilder()
        .setLabel('ご飯')
        .setValue('meal')
        .setEmoji('🍚'),
      new StringSelectMenuOptionBuilder()
        .setLabel('飲み')
        .setValue('drink')
        .setEmoji('🍺'),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

// --- /hangout: 入力 Modal ---

export function buildHangoutModal(kind: EventKind): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`hangout_modal:${kind}`)
    .setTitle(`${KIND_LABELS[kind]}イベントを作成`);

  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('タイトル')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('例: 今からラーメン / 30分だけ雑談')
    .setRequired(true)
    .setMaxLength(80);

  const startInput = new TextInputBuilder()
    .setCustomId('start_text')
    .setLabel('開始（自由記述）')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('例: 今から / 19:30ごろ / 今日の夜')
    .setRequired(true)
    .setMaxLength(80);

  const meetupInput = new TextInputBuilder()
    .setCustomId('meetup_text')
    .setLabel('集合場所（任意）')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('例: 42入口 / ラウンジ / 新宿中央公園方面')
    .setRequired(false)
    .setMaxLength(80);

  const noteInput = new TextInputBuilder()
    .setCustomId('note')
    .setLabel('ひとこと（任意）')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500);

  const rows: ActionRowBuilder<TextInputBuilder>[] = [
    new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(startInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(meetupInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(noteInput),
  ];

  if (kind === 'meal' || kind === 'drink') {
    const placeReqInput = new TextInputBuilder()
      .setCustomId('place_request')
      .setLabel('店リクエスト（任意）')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('例: ラーメン / 安め / カフェ / 居酒屋')
      .setRequired(false)
      .setMaxLength(80);
    rows.push(
      new ActionRowBuilder<TextInputBuilder>().addComponents(placeReqInput),
    );
  }

  modal.addComponents(...rows);
  return modal;
}

// --- イベントカード Embed ---

function formatPlaceLine(
  index: number,
  p: PlaceSuggestionRow | PlaceCandidate,
): string {
  const ratingPart =
    p.rating != null
      ? ` ★${p.rating.toFixed(1)}${
          p.userRatingCount != null ? `（${p.userRatingCount}件）` : ''
        }`
      : '';
  const link = p.googleMapsUrl ? `[${p.name}](${p.googleMapsUrl})` : p.name;
  return `${index}. ${link}${ratingPart}`;
}

export function buildEventEmbed(
  event: EventRow,
  participants: ParticipantRow[],
  places: PlaceSuggestionRow[],
): EmbedBuilder {
  const emoji = KIND_EMOJIS[event.kind];
  const kindLabel = KIND_LABELS[event.kind];
  const goingCount = participants.filter(
    (p) => p.status === 'going' || p.status === 'softdrink',
  ).length;
  const maybeCount = participants.filter((p) => p.status === 'maybe').length;
  const closedSuffix = event.status === 'closed' ? '【終了】' : '';

  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${event.title}${closedSuffix}`)
    .setDescription(`種別: ${kindLabel}`)
    .addFields(
      { name: '開始', value: event.startText, inline: true },
      { name: '集合', value: event.meetupText ?? '未定', inline: true },
      { name: '​', value: '​', inline: true },
      { name: '作成者', value: event.createdByName, inline: true },
      { name: '参加', value: `${goingCount}人`, inline: true },
      { name: '気になる', value: `${maybeCount}人`, inline: true },
    )
    .setFooter({ text: `event_id: ${event.id}` })
    .setColor(
      event.status === 'closed' ? COLOR_CLOSED : COLOR_BY_KIND[event.kind],
    );

  if (event.note) {
    embed.addFields({ name: 'メモ', value: event.note, inline: false });
  }

  if ((event.kind === 'meal' || event.kind === 'drink') && places.length > 0) {
    const lines = places
      .slice(0, 3)
      .map((p, i) => formatPlaceLine(i + 1, p));
    embed.addFields({ name: '店候補', value: lines.join('\n'), inline: false });
  }

  if (event.kind === 'drink') {
    embed.addFields({ name: '⚠️ 注意', value: DRINK_WARNING, inline: false });
  }

  return embed;
}

// --- イベントカード Buttons ---

export function buildEventComponents(
  event: EventRow,
): ActionRowBuilder<ButtonBuilder>[] {
  const isClosed = event.status === 'closed';
  const eid = event.id;

  const goingBtn = new ButtonBuilder()
    .setCustomId(`rsvp:${eid}:going`)
    .setLabel('参加する')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(isClosed);
  const softdrinkBtn = new ButtonBuilder()
    .setCustomId(`rsvp:${eid}:softdrink`)
    .setLabel('飲まないで参加する')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(isClosed);
  const maybeBtn = new ButtonBuilder()
    .setCustomId(`rsvp:${eid}:maybe`)
    .setLabel('気になる')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(isClosed);
  const declineBtn = new ButtonBuilder()
    .setCustomId(`rsvp:${eid}:declined`)
    .setLabel('やめる')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(isClosed);
  const listBtn = new ButtonBuilder()
    .setCustomId(`list:${eid}`)
    .setLabel('参加者を見る')
    .setStyle(ButtonStyle.Secondary);
  const closeBtn = new ButtonBuilder()
    .setCustomId(`close:${eid}`)
    .setLabel('閉じる')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(isClosed);

  if (event.kind === 'drink') {
    // 飲みは6個になるので2行に分ける
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        goingBtn,
        softdrinkBtn,
        maybeBtn,
        declineBtn,
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(listBtn, closeBtn),
    ];
  }
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      goingBtn,
      maybeBtn,
      declineBtn,
      listBtn,
      closeBtn,
    ),
  ];
}

// --- /events: 一覧 Embed ---

export function buildEventListEmbed(events: EventRow[]): EmbedBuilder {
  if (events.length === 0) {
    return new EmbedBuilder()
      .setTitle('現在アクティブなイベントはありません')
      .setColor(COLOR_CLOSED);
  }
  const lines = events.map((e) => {
    const emoji = KIND_EMOJIS[e.kind];
    const link =
      e.messageId && e.channelId && e.guildId
        ? ` [→](https://discord.com/channels/${e.guildId}/${e.channelId}/${e.messageId})`
        : '';
    return `${emoji} **${e.title}** — ${e.startText} / by ${e.createdByName} (\`${e.id}\`)${link}`;
  });
  return new EmbedBuilder()
    .setTitle('アクティブなイベント')
    .setDescription(lines.join('\n'))
    .setColor(COLOR_LIST);
}

// --- /spot: 単発候補 Embed ---

export function buildSpotEmbed(
  places: PlaceCandidate[],
  kind: 'meal' | 'drink',
): EmbedBuilder {
  const emoji = KIND_EMOJIS[kind];
  const label = KIND_LABELS[kind];
  if (places.length === 0) {
    return new EmbedBuilder()
      .setTitle(`${emoji} ${label}の店候補`)
      .setDescription('候補が見つかりませんでした。')
      .setColor(COLOR_CLOSED);
  }
  const lines = places.map((p, i) => {
    const main = formatPlaceLine(i + 1, p);
    const addr = p.address ? `\n   ${p.address}` : '';
    return `${main}${addr}`;
  });
  const sourceNote =
    places[0]?.source === 'fallback'
      ? '\n\n_GOOGLE_MAPS_API_KEY が未設定のため fallback 候補を表示しています_'
      : '';
  return new EmbedBuilder()
    .setTitle(`${emoji} ${label}の店候補`)
    .setDescription(lines.join('\n') + sourceNote)
    .setColor(COLOR_BY_KIND[kind]);
}

// --- 参加者一覧 (ephemeral) Embed ---

export function buildParticipantListEmbed(
  event: EventRow,
  participants: ParticipantRow[],
): EmbedBuilder {
  const groupBy = (status: ParticipantRow['status']) =>
    participants.filter((p) => p.status === status);
  const fmt = (list: ParticipantRow[]) =>
    list.length > 0 ? list.map((p) => p.displayName).join(', ') : '（なし）';

  const going = groupBy('going');
  const softdrink = groupBy('softdrink');
  const maybe = groupBy('maybe');
  const declined = groupBy('declined');

  const embed = new EmbedBuilder()
    .setTitle(`参加者一覧: ${event.title}`)
    .setColor(COLOR_BY_KIND[event.kind])
    .addFields({
      name: `参加 (${going.length})`,
      value: fmt(going),
      inline: false,
    });

  if (event.kind === 'drink' || softdrink.length > 0) {
    embed.addFields({
      name: `飲まないで参加 (${softdrink.length})`,
      value: fmt(softdrink),
      inline: false,
    });
  }
  embed.addFields(
    {
      name: `気になる (${maybe.length})`,
      value: fmt(maybe),
      inline: false,
    },
    {
      name: `やめる (${declined.length})`,
      value: fmt(declined),
      inline: false,
    },
  );
  return embed;
}
