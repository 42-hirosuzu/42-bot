import { SlashCommandBuilder } from 'discord.js';

/**
 * Guild Command として登録する Slash Command 定義一覧。
 * - /hangout: イベント作成のエントリ。実行直後に種別 SelectMenu を ephemeral で出す。
 * - /events: アクティブなイベント一覧（ephemeral, 最大10件）
 * - /spot: 店候補のみを返す。イベントは作成しない。
 * - /event_close: 自分が作ったイベントを閉じる。
 *
 * いずれも DM では使わせない。
 */
export const commandsData = [
  new SlashCommandBuilder()
    .setName('hangout')
    .setDescription('突発交流イベントを作成する（種別を選択 → モーダル入力）')
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('events')
    .setDescription('現在アクティブなイベント一覧を表示する')
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('spot')
    .setDescription('店候補だけを表示する（イベントは作らない）')
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName('kind')
        .setDescription('種別')
        .setRequired(true)
        .addChoices(
          { name: 'ご飯', value: 'meal' },
          { name: '飲み', value: 'drink' },
        ),
    ),
  new SlashCommandBuilder()
    .setName('event_close')
    .setDescription('自分が作ったイベントを閉じる')
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName('event_id').setDescription('閉じるイベントのID').setRequired(true),
    ),
].map((c) => c.toJSON());
