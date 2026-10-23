import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../core/icon';

/**
 * The frame around every sign-in screen: a colorful, gently animated brand panel on the left
 * (on top on phones) and the form on the right.
 */
@Component({
  selector: 'app-auth-frame',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="frame">
      <aside class="brand" aria-hidden="true">
        <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>
        <div class="brand-inner">
          <div class="logo"><span class="mark"><app-icon name="check" /></span>Doable</div>
          <h2>Plan the day.<br />Share the work.<br /><span class="hl">Get it done.</span></h2>
          <p class="lead">Tasks, projects and teammates in one calm place.</p>

          <div class="cards">
            <div class="tcard c1">
              <span class="tick done"><app-icon name="check" [small]="true" /></span>
              <div><b>Send the proposal</b><span class="chip today">Today 10:00</span></div>
            </div>
            <div class="tcard c2">
              <span class="tick p1 anim"><app-icon name="check" [small]="true" /></span>
              <div><b>Review launch plan</b><span class="chip">#Launch · 2/3</span></div>
              <span class="av">MA</span>
            </div>
            <div class="tcard c3">
              <span class="tick"></span>
              <div><b>Book team offsite</b><span class="chip soon">Deadline Fri</span></div>
            </div>
          </div>

          <ul class="perks">
            <li><app-icon name="sparkle" [small]="true" />Type “tomorrow 3pm p1” and it just works</li>
            <li><app-icon name="share" [small]="true" />Invite your team with the right permissions</li>
            <li><app-icon name="bell" [small]="true" />Live reminders before deadlines slip</li>
          </ul>
        </div>
      </aside>
      <main class="side">
        <div class="side-inner"><ng-content /></div>
      </main>
    </div>
  `,
  styles: `
    :host { display: block; min-height: 100%; }
    .frame { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); min-height: 100vh; background: var(--bg); }

    /* ---- brand panel ---- */
    .brand {
      position: relative; overflow: hidden; color: #fff; display: flex; align-items: center; justify-content: center;
      padding: 48px; background: linear-gradient(140deg, #173f35 0%, #2f6f5e 45%, #1d8a99 100%);
    }
    .blob { position: absolute; border-radius: 50%; filter: blur(60px); opacity: .55; animation: drift 18s ease-in-out infinite alternate; }
    .b1 { width: 380px; height: 380px; background: #e8a33d; top: -120px; right: -80px; }
    .b2 { width: 320px; height: 320px; background: #8a4fb8; bottom: -120px; left: -60px; animation-duration: 22s; opacity: .4; }
    .b3 { width: 260px; height: 260px; background: #5fb39a; top: 40%; left: 45%; animation-duration: 26s; opacity: .35; }
    @keyframes drift {
      0% { transform: translate(0, 0) scale(1); }
      50% { transform: translate(30px, -40px) scale(1.12); }
      100% { transform: translate(-30px, 30px) scale(.95); }
    }
    .brand-inner { position: relative; max-width: 460px; width: 100%; animation: rise .7s cubic-bezier(.2, .7, .3, 1) both; }
    .logo { display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 800; letter-spacing: -.01em; }
    .mark { width: 38px; height: 38px; border-radius: 12px; background: rgba(255, 255, 255, .16); display: grid; place-items: center;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .25); backdrop-filter: blur(6px); }
    h2 { font-size: 40px; line-height: 46px; letter-spacing: -.02em; margin: 36px 0 12px; font-weight: 800; }
    .hl { background: linear-gradient(90deg, #ffd27d, #f0b45a); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .lead { font-size: 17px; line-height: 26px; color: rgba(255, 255, 255, .82); margin: 0 0 28px; }

    .cards { display: flex; flex-direction: column; gap: 12px; margin-bottom: 28px; }
    .tcard {
      display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px;
      background: rgba(255, 255, 255, .12); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .18), 0 10px 30px rgba(0, 0, 0, .15);
      backdrop-filter: blur(10px); animation: float 6s ease-in-out infinite;
    }
    .tcard div { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
    .tcard b { font-weight: 600; font-size: 14px; }
    .c1 { margin-right: 48px; animation-delay: -1s; }
    .c2 { margin-left: 32px; animation-delay: -3s; }
    .c3 { margin-right: 20px; animation-delay: -5s; }
    @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    .chip { font-size: 12px; color: rgba(255, 255, 255, .78); }
    .chip.today { color: #9ff0c2; } .chip.soon { color: #ffd27d; }
    .tick { width: 20px; height: 20px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, .7); display: grid; place-items: center; flex: none; color: transparent; }
    .tick.done { background: #9ff0c2; border-color: #9ff0c2; color: #173f35; }
    .tick.p1 { border-color: #ff9a8f; }
    /* The middle card ticks itself off, again and again. */
    .tick.anim { animation: tick 4s ease-in-out infinite; }
    @keyframes tick {
      0%, 35% { background: transparent; color: transparent; border-color: #ff9a8f; transform: scale(1); }
      45% { transform: scale(1.25); }
      55%, 85% { background: #ff9a8f; color: #3d1410; border-color: #ff9a8f; transform: scale(1); }
      100% { background: transparent; color: transparent; }
    }
    .av { width: 26px; height: 26px; border-radius: 50%; background: #e8a33d; color: #2a1d06; font-size: 10px; font-weight: 800; display: grid; place-items: center; }

    .perks { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
    .perks li { display: flex; align-items: center; gap: 10px; font-size: 14px; color: rgba(255, 255, 255, .88); }
    .perks li app-icon { color: #ffd27d; }

    /* ---- form side ---- */
    .side { display: flex; align-items: center; justify-content: center; padding: 48px 32px; position: relative; }
    .side-inner { width: 100%; max-width: 480px; animation: rise .55s .1s cubic-bezier(.2, .7, .3, 1) both; }
    @keyframes rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }

    @media (max-width: 960px) {
      .frame { grid-template-columns: minmax(0, 1fr); }
      .brand { padding: 28px 24px 32px; }
      h2 { font-size: 28px; line-height: 34px; margin: 18px 0 6px; }
      .lead { margin: 0; font-size: 15px; }
      .cards, .perks { display: none; }
      .side { padding: 28px 18px 48px; align-items: flex-start; }
    }
    @media (prefers-reduced-motion: reduce) {
      .blob, .tcard, .tick.anim, .brand-inner, .side-inner { animation: none; }
    }
  `,
})
export class AuthFrame {}
