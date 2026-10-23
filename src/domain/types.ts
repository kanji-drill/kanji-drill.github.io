/** 1 語 = 語彙マスタの 1 行 */
export type Word = {
  /** "w0001" の形。一度振ったら変えない */
  id: string;
  /** 漢字表記（例: 沸騰）。訓読みの語は送り仮名まで含める（例: 競う） */
  word: string;
  /** カタカナにする部分（例: フットウ）。訓読みの語は漢字の部分だけ（例: 競う → キソ） */
  kana: string;
  /** 出題で問われる 1 字（例: 沸） */
  key: string;
  /** word の中で key が何文字目か（0 始まり） */
  keyIndex: number;
  /** key の音読み（例: フツ）。同音グループの単位。訓読みの語も、その漢字の音読みのグループに入る（例: 競う → キョウ） */
  reading: string;
  /** 訓読みの語か（例: 競う、帯びる、肩）。1 字の漢字＋送り仮名の形 */
  kun?: boolean;
  /**
   * 別の正しい表記（例: 換える に対する 替える）。
   * 正しい選択肢を選べていれば、どちらを書いても正解とする。答え合わせではカッコで併記する
   */
  alt?: string[];
  /**
   * 誤りの選択肢にだけ使う語（例: 嫉妬）。自然な語が 1 つしかない字の語で、設問や正解の選択肢にはしない。
   * 書けなかったときは、期日の来た復習で同じ音の問題の誤りの選択肢に入れて出し直す
   */
  distractorOnly?: boolean;
  /** 常用漢字表にない字で、例外として認めるもの（例: 剽窃 の 剽）。問われる字には使わない。書けなくてもよい */
  nonJoyo?: string[];
  /** 語の意味。答え合わせで表示する（nonJoyo のある語では必須） */
  meaning?: string;
  /** kana の中での key の実際の表記（促音化・連濁に対応。例: フッ） */
  keyKana: string;
  /** 例文。カタカナにする部分を {} で囲む（例: 湯が{フットウ}する） */
  sentence: string;
  /** 過去問の出典（例: 2019センター本試 問1(ア)） */
  source: string | null;
  /** ユーザーが確認済みか */
  verified: boolean;
  /** v2: 字の意味 */
  keyGloss?: string;
  /** v2: 字形の似た字 */
  confusable?: string[];
  /** v2: 過去問の出題語／標準／発展 */
  tier?: 'past' | 'standard' | 'advanced';
};

export type Master = {
  version: string;
  words: Word[];
};

/** 選択肢の数。近年の共通テストは 4 択だが、練習量を重視して 5 択にしている */
export const CHOICES = 5;

/** 1 問 = 設問の語 1 つと選択肢 CHOICES 個 */
export type Question = {
  reading: string;
  key: string;
  /** 設問の語の id */
  target: string;
  /** 選択肢の語の id（CHOICES 個） */
  options: string[];
  /** 正解の選択肢の位置（0 始まり） */
  correct: number;
  /** 復習のセットで、期日を迎えた選択肢専用の語を誤りの選択肢に入れたときの、その語の id（連続回数に数える） */
  reviewed?: string[];
};

export type SetKind = 'new' | 'review';
