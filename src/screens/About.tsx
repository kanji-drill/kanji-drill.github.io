import { BackIcon, Header, IconButton } from '../components/ui';
import { masterVersion } from '../data/master';

export function About({ onBack }: { onBack: () => void }) {
  const base = import.meta.env.BASE_URL;
  return (
    <div className="flex min-h-svh flex-col px-4 pb-8">
      <Header
        left={
          <IconButton label="戻る" onClick={onBack}>
            <BackIcon />
          </IconButton>
        }
        title="このアプリについて"
      />
      <main className="paper-card flex flex-col gap-4 px-5 py-5 text-[15px] leading-relaxed">
        <section>
          <h2 className="m-0 mb-1 text-[16px] font-bold">どんなアプリか</h2>
          <p className="m-0">
            大学入学共通テスト・センター試験の漢字問題と同じ形式で、同じ音の漢字を選び分ける練習をするアプリです。出題した語は記録され、すべての語を一巡するまで同じ語は出ません。書けなかった語だけを、間隔をあけて復習に出します。
          </p>
        </section>
        <section>
          <h2 className="m-0 mb-1 text-[16px] font-bold">記録の保存について</h2>
          <ul className="m-0 pl-5">
            <li>記録はこの端末のブラウザの中だけに保存され、外部には送信しません。</li>
            <li>名前などの個人情報は集めていません。</li>
            <li>ブラウザのデータを消すと記録も消えます。ときどき「記録を書き出す」で保存してください。</li>
          </ul>
        </section>
        <section>
          <h2 className="m-0 mb-1 text-[16px] font-bold">ご注意</h2>
          <ul className="m-0 pl-5">
            <li>このアプリは大学入試センターとは関係ありません。</li>
            <li>問題の例文はすべてオリジナルです。過去問の問題文は掲載していません。</li>
            <li>
              内容には誤りが含まれる可能性があります。無保証でご利用ください。誤りに気づいたら先生に知らせてください。
            </li>
          </ul>
        </section>
        <section>
          <h2 className="m-0 mb-1 text-[16px] font-bold">フォント</h2>
          <p className="m-0">
            BIZ UD明朝（© The BIZ UDMincho Project Authors）、BIZ UDPゴシック（© The BIZ UDGothic Project
            Authors）、Klee One（© The Klee Project Authors）を、SIL Open Font License 1.1 のもとで使用しています。
            <a className="ml-1 text-shu underline underline-offset-4" href={`${base}licenses/OFL.txt`}>
              ライセンス全文
            </a>
          </p>
        </section>
        <p className="m-0 text-[13px] text-ink-sub">問題データ：{masterVersion}</p>
      </main>
    </div>
  );
}
