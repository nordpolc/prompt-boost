window.__ModuleLoader__.load({
  id: '@local/prompt-boost',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;

    /* The shared primitive bundle is in the frontend module table; fall back to
       a plain button and a hand-drawn glyph when a future host stops exporting it. */
    let Tooltip;
    let IconSparkle;
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
      Tooltip = primitives && primitives.Tooltip;
      IconSparkle = primitives && primitives.IconSparkleRegular;
    } catch (error) {
      Tooltip = undefined;
      IconSparkle = undefined;
    }

    const NS = 'prompt-boost';
    const SLOT = 'conversation.input.right';
    const WORKSPACE_ROUTE = '/prompt-boost/workspace';
    const ROUTE = 'prompt-boost/enhance';
    const PERSONA_KEY = 'dsh.prompt-boost.persona';
    const CONTEXT_KEY = 'dsh.prompt-boost.context';
    const BRIEF_KEY = 'dsh.prompt-boost.brief';

    /* How many replaced drafts the revert stack keeps, newest last. */
    const MAX_UNDO = 8;

    /**
     * The picker's copy of the persona list. The host owns the briefs
     * (`personas.js`); this table only renders names, so the two are kept in
     * step by a smoke test that compares their ids.
     */
    const PERSONAS = [
      { id: 'auto', zh: { name: '自动', hint: '按草稿判断该用哪个职业', glyph: '自' }, en: { name: 'Auto', hint: 'Pick the profession from the draft', glyph: 'A' } },
      { id: 'product', zh: { name: '产品经理', hint: '需求、边界、验收', glyph: '产' }, en: { name: 'Product', hint: 'Needs, scope, acceptance', glyph: 'P' } },
      { id: 'engineer', zh: { name: '研发工程师', hint: '代码、实现、排错', glyph: '研' }, en: { name: 'Engineer', hint: 'Code, implementation, debugging', glyph: 'E' } },
      { id: 'ops', zh: { name: '运维工程师', hint: '部署、变更、故障', glyph: '维' }, en: { name: 'Ops', hint: 'Deploys, changes, incidents', glyph: 'O' } },
      { id: 'data', zh: { name: '数据分析', hint: '口径、对比、结论', glyph: '数' }, en: { name: 'Data', hint: 'Definitions, baselines, findings', glyph: 'D' } },
      { id: 'design', zh: { name: '设计师', hint: '层级、状态、一致性', glyph: '设' }, en: { name: 'Design', hint: 'Hierarchy, states, consistency', glyph: 'S' } },
      { id: 'marketing', zh: { name: '市场运营', hint: '人群、渠道、指标', glyph: '运' }, en: { name: 'Marketing', hint: 'Audience, channels, metrics', glyph: 'M' } },
      { id: 'content', zh: { name: '内容编辑', hint: '受众、渠道、发布', glyph: '文' }, en: { name: 'Content', hint: 'Readers, channel, publish', glyph: 'C' } },
      { id: 'project', zh: { name: '项目经理', hint: '范围、进度、依赖', glyph: '项' }, en: { name: 'Project', hint: 'Scope, schedule, dependencies', glyph: 'J' } },
      { id: 'finance', zh: { name: '财务', hint: '口径、成本、现金', glyph: '财' }, en: { name: 'Finance', hint: 'Basis, cost, cash', glyph: 'F' } },
      { id: 'sales', zh: { name: '销售商务', hint: '客户、异议、成交', glyph: '销' }, en: { name: 'Sales', hint: 'Customer, objections, close', glyph: 'L' } },
      { id: 'legal', zh: { name: '法务合规', hint: '依据、条款、风险', glyph: '法' }, en: { name: 'Legal', hint: 'Basis, clauses, exposure', glyph: 'G' } },
      { id: 'coach', zh: { name: '培训教练', hint: '分步、练习、检查点', glyph: '教' }, en: { name: 'Coach', hint: 'Steps, practice, checkpoints', glyph: 'T' } },
      { id: 'custom', zh: { name: '自定义', hint: '按你写的要求补', glyph: '定' }, en: { name: 'Custom', hint: 'Follow the brief you wrote', glyph: 'X' } },
    ];

    /** What every enhancement request carries when the author has not edited it. */
    const DEFAULT_CONTEXT = [
      '要能直接用的结果：结论先行、步骤可执行、有验收；不要空话、套路过渡和防御性免责。',
      '方案先算成本与收益；能复用现成方案就不自建。',
      '中文交付；成稿按交付物要求给格式，表格先定口径。',
      '不写我的姓名、公司、岗位和经历：人格只决定专业口径。',
    ].join('\n');

    function copyOf(lang) {
      const dict = {
        title: lang === 'en' ? 'Enhance prompt' : '增强提示词',
        busy: lang === 'en' ? 'Enhancing…' : '正在增强…',
        empty: lang === 'en' ? 'Type something first' : '先输入一些内容',
        failed: lang === 'en' ? 'Enhancement failed' : '增强失败',
        revert: lang === 'en' ? 'Revert' : '回退',
        revertHint: lang === 'en' ? 'Restore the draft from before the enhancement' : '回退到增强前的草稿',
        persona: lang === 'en' ? 'Persona' : '人格',
        personaHint: lang === 'en' ? 'What this request needs, not just how it is worded' : '决定补什么，不只是怎么排版',
        context: lang === 'en' ? 'Task constraints' : '任务约束',
        contextHint: lang === 'en'
          ? 'Task facts only: budget, platform, length, deadline. No name, company or job title — those are never written into the result. Stored in this browser only.'
          : '只写这次任务的事实：预算、平台、字数、期限。不写姓名、公司、岗位——这些不会出现在成稿里。只存在本机浏览器。',
        contextEdit: lang === 'en' ? 'Edit' : '编辑',
        contextHide: lang === 'en' ? 'Hide' : '收起',
        contextReset: lang === 'en' ? 'Reset' : '恢复默认',
        contextEmpty: lang === 'en' ? 'Off' : '未启用',
        hintLabel: lang === 'en' ? 'Workspace clues: ' : '工作区线索：',
        hintReading: lang === 'en' ? 'reading…' : '读取中…',
        hintNone: lang === 'en' ? 'none found' : '没识别到项目',
        brief: lang === 'en' ? 'This request needs' : '这次要补什么',
        briefHint: lang === 'en'
          ? 'Your own instruction for this seat, stored in this browser only.'
          : '你写给它照做的话，只存在本机浏览器。',
        briefPlaceholder: lang === 'en'
          ? 'e.g. only fill the numbers and the caveats; skip layout advice'
          : '例：只补数据和口径，别给我排版建议',
      };
      for (const persona of PERSONAS) {
        const words = lang === 'en' ? persona.en : persona.zh;
        dict[`persona.${persona.id}.name`] = words.name;
        dict[`persona.${persona.id}.hint`] = words.hint;
        dict[`persona.${persona.id}.glyph`] = words.glyph;
      }
      return dict;
    }

    /** Page base without query/hash, always ending in a slash (reverse-proxy safe). */
    function directoryBase(baseUrl) {
      const url = new URL(baseUrl === '' ? 'http://dsh.internal/' : baseUrl, 'http://dsh.internal/');
      url.search = '';
      url.hash = '';
      if (!url.pathname.endsWith('/')) url.pathname += '/';
      return url;
    }

    /** Absolute URL of one host route, resolved against the page base. */
    function routeUrl(path) {
      const base = typeof document !== 'undefined' && document.baseURI ? document.baseURI : '';
      return new URL(path.replace(/^\/+/, ''), directoryBase(base)).href;
    }

    function readStored(key) {
      try {
        if (typeof window === 'undefined' || !window.localStorage) return null;
        const value = window.localStorage.getItem(key);
        return typeof value === 'string' ? value : null;
      } catch (error) {
        return null;
      }
    }

    function writeStored(key, value) {
      try {
        if (typeof window === 'undefined' || !window.localStorage) return;
        window.localStorage.setItem(key, value);
      } catch (error) {
        /* a locked-down browser keeps the choice for this page only */
      }
    }

    function storedPersona() {
      const value = readStored(PERSONA_KEY);
      return PERSONAS.some((persona) => persona.id === value) ? value : 'auto';
    }

    function storedContext() {
      const value = readStored(CONTEXT_KEY);
      return value === null ? DEFAULT_CONTEXT : value;
    }

    function storedBrief() {
      const value = readStored(BRIEF_KEY);
      return value === null ? '' : value;
    }

    function SparkleIcon(props) {
      const size = props.size || 16;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'currentColor',
        'aria-hidden': 'true',
        focusable: 'false',
      },
      h('path', {
        d: 'M6.05 1.6c.13 1.44.5 2.42 1.12 3.04.62.62 1.6.99 3.04 1.12-1.44.13-2.42.5-3.04 1.12-.62.62-.99 1.6-1.12 3.04-.13-1.44-.5-2.42-1.12-3.04-.62-.62-1.6-.99-3.04-1.12 1.44-.13 2.42-.5 3.04-1.12.62-.62.99-1.6 1.12-3.04Z',
      }),
      h('path', {
        d: 'M11.85 8.4c.09.98.34 1.65.76 2.07.42.42 1.09.67 2.07.76-.98.09-1.65.34-2.07.76-.42.42-.67 1.09-.76 2.07-.09-.98-.34-1.65-.76-2.07-.42-.42-1.09-.67-2.07-.76.98-.09 1.65-.34 2.07-.76.42-.42.67-1.09.76-2.07Z',
      }));
    }

    function UndoIcon(props) {
      const size = props.size || 15;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      },
      h('path', { d: 'M5.6 3.7 2.9 6.4l2.7 2.7' }),
      h('path', { d: 'M2.9 6.4h5.2a3.1 3.1 0 0 1 0 6.2H6.6' }));
    }

    function ChevronIcon(props) {
      return h('svg', {
        width: 10,
        height: 10,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      }, h('path', { d: 'M3.5 6.2 8 10.8l4.5-4.6' }));
    }

    function CheckIcon() {
      return h('svg', {
        width: 13,
        height: 13,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.9,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      }, h('path', { d: 'M3.4 8.4 6.6 11.6l6-7.2' }));
    }

    function SpinnerIcon(props) {
      const size = props.size || 15;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
        focusable: 'false',
        className: 'dsh-pb-spin',
      }, h('circle', {
        cx: 8,
        cy: 8,
        r: 5.6,
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeDasharray: '8.8 26.4',
      }));
    }

    const CSS = [
      '.dsh-pb-wrap{position:relative;display:inline-flex;align-items:center;gap:2px;flex:none}',
      '.dsh-pb-btn{width:28px;height:28px;flex:none;display:grid;place-items:center;padding:0;border:none;border-radius:999px;cursor:pointer;background:var(--dsw-specific-selector);color:var(--dsw-alias-label-primary);transition:background .15s ease,opacity .15s ease}',
      '.dsh-pb-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}',
      '.dsh-pb-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.dsh-pb-btn:disabled{opacity:.45;cursor:default}',
      '.dsh-pb-btn[data-busy="true"]{opacity:1}',
      '.dsh-pb-caret{width:18px;background:transparent;opacity:.66}',
      '.dsh-pb-caret:hover:not(:disabled){opacity:1}',
      '.dsh-pb-caret[aria-expanded="true"]{opacity:1;background:var(--dsw-specific-selector)}',
      '.dsh-pb-revert{animation:dsh-pb-appear .12s ease-out}',
      '@keyframes dsh-pb-appear{from{opacity:0;transform:scale(.86)}to{opacity:1;transform:none}}',
      '.dsh-pb-spin{animation:dsh-pb-rotate .9s linear infinite;transform-origin:50% 50%}',
      '@keyframes dsh-pb-rotate{to{transform:rotate(360deg)}}',
      '.dsh-pb-menu{position:fixed;z-index:2147482000;width:304px;max-width:calc(100vw - 16px);max-height:min(520px,calc(100vh - 96px));overflow-y:auto;overscroll-behavior:contain;padding:6px;border-radius:12px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);box-shadow:0 14px 44px rgba(0,0,0,.26);animation:dsh-pb-rise .12s ease-out}',
      '@keyframes dsh-pb-rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}',
      '.dsh-pb-menu-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:4px 8px 6px;font-size:11px;line-height:14px;letter-spacing:.04em;text-transform:uppercase;opacity:.6}',
      '.dsh-pb-menu-head small{font-size:10.5px;letter-spacing:0;text-transform:none;opacity:.85;text-align:right}',
            '.dsh-pb-menu-grid{width:min(392px,calc(100vw - 16px))}',
      '.dsh-pb-menu-grid .dsh-pb-items{display:grid;grid-template-columns:1fr 1fr;gap:0 4px}',
      '.dsh-pb-menu-grid .dsh-pb-item{padding:5px 6px}',
      '.dsh-pb-menu-grid .dsh-pb-item-hint{font-size:10.5px;line-height:14px}',
      '.dsh-pb-item{display:flex;width:100%;box-sizing:border-box;gap:8px;align-items:center;padding:6px 8px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;font:inherit}',
      '.dsh-pb-item:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}',
      '.dsh-pb-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-pb-item[aria-checked="true"]{background:var(--dsw-specific-selector)}',
      '.dsh-pb-glyph{width:20px;height:20px;flex:none;display:grid;place-items:center;border-radius:6px;font-size:11px;line-height:1;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);opacity:.9}',
      '.dsh-pb-item-text{display:flex;flex-direction:column;min-width:0;flex:1}',
      '.dsh-pb-item-name{font-size:12.5px;line-height:17px;font-weight:500}',
      '.dsh-pb-item-hint{font-size:11px;line-height:15px;opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-pb-check{flex:none;display:grid;place-items:center;width:16px;color:var(--dsw-alias-brand-primary)}',
      '.dsh-pb-menu-foot{margin-top:6px;padding:6px 4px 2px;border-top:1px solid var(--dsw-alias-border-l2)}',
      '.dsh-pb-hint{display:block;box-sizing:border-box;padding:2px 6px 6px;font-size:11px;line-height:15px;opacity:.68;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-pb-context-toggle{display:flex;width:100%;box-sizing:border-box;align-items:center;justify-content:space-between;gap:8px;padding:6px 6px;border:none;border-radius:8px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:12px;line-height:16px}',
      '.dsh-pb-context-toggle:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}',
      '.dsh-pb-context-state{font-size:11px;opacity:.55}',
      '.dsh-pb-brief{padding:6px 0 2px;border-top:1px solid var(--dsw-alias-border-l2);margin-top:4px}',
      '.dsh-pb-context-label{padding:0 6px 2px;font-size:11px;line-height:15px;font-weight:560}',
      '.dsh-pb-brief-box{min-height:66px;max-height:140px}',
      '.dsh-pb-context-note{padding:0 6px 6px;font-size:11px;line-height:15px;opacity:.55}',
      '.dsh-pb-context{display:block;width:calc(100% - 12px);max-width:calc(100% - 12px);box-sizing:border-box;min-height:92px;max-height:190px;margin:0 6px;padding:7px 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;line-height:17px;resize:vertical}',
      '.dsh-pb-context:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-pb-context-actions{display:flex;justify-content:flex-end;padding:6px 6px 0}',
      '.dsh-pb-reset{padding:3px 8px;border:none;border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:11px;line-height:15px;opacity:.6;cursor:pointer}',
      '.dsh-pb-reset:hover{opacity:1;background:var(--dsw-alias-interactive-bg-hover-solid)}',
      '.dsh-pb-error{position:fixed;z-index:60;transform:translate(-50%,-100%);max-width:280px;padding:6px 10px;border-radius:8px;font-size:12px;line-height:16px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-state-error-primary);border:1px solid var(--dsw-alias-border-l2);box-shadow:0 6px 20px rgba(0,0,0,.18);pointer-events:none}',
      '@media (prefers-reduced-motion:reduce){.dsh-pb-spin,.dsh-pb-revert,.dsh-pb-menu{animation:none}}',
    ].join('\n');

    return {
      inject: ['slots', 'locale'],
      personas: PERSONAS,
      apply(ctx) {
        const dict = { zh: copyOf('zh'), en: copyOf('en') };
        ctx.effect(() => ctx.locale.register(NS, dict), 'prompt-boost: dictionaries');
        const t = ctx.locale.bind(NS);

        function personaWords(id) {
          return {
            name: t(`persona.${id}.name`),
            hint: t(`persona.${id}.hint`),
            glyph: t(`persona.${id}.glyph`),
          };
        }

        function EnhanceButton(props) {
          const useInput = props.useInput;
          const inputActions = props.inputActions;
          const draft = typeof useInput === 'function' ? useInput((state) => (state && state.draft) || '') : '';
          const [busy, setBusy] = useState(false);
          const [error, setError] = useState(null);
          /* Drafts an enhancement replaced, newest last; `enhanced` is the text
             this plugin last wrote, so the revert only offers a live snapshot. */
          const [replaced, setReplaced] = useState([]);
          const [enhanced, setEnhanced] = useState(null);
          const [persona, setPersona] = useState(storedPersona);
          const [context, setContext] = useState(storedContext);
          const [brief, setBrief] = useState(storedBrief);
          const [menuOpen, setMenuOpen] = useState(false);
          const [contextOpen, setContextOpen] = useState(false);
          const [menuAt, setMenuAt] = useState({ left: 8, bottom: 64 });
          const [hints, setHints] = useState(null);
          const buttonRef = useRef(null);
          const caretRef = useRef(null);
          const menuRef = useRef(null);
          const abortRef = useRef(null);
          const aliveRef = useRef(true);

          useEffect(() => () => {
            aliveRef.current = false;
            if (abortRef.current) abortRef.current.abort();
          }, []);

          useEffect(() => {
            if (error === null) return undefined;
            const timer = window.setTimeout(() => setError(null), 4000);
            return () => window.clearTimeout(timer);
          }, [error]);

          /* A fixed menu over a composer: close it the way the rest of the app
             does, on an outside press or Escape, rather than on hover-out. */
          useEffect(() => {
            if (!menuOpen || hints !== null) return undefined;
            let cancelled = false;
            fetch(routeUrl(WORKSPACE_ROUTE), { credentials: 'same-origin' })
              .then((response) => (response.ok ? response.json() : null))
              .then((data) => {
                if (cancelled || !data || data.ok !== true) return;
                setHints({ root: data.root, summary: data.summary });
              })
              .catch(() => undefined);
            return () => { cancelled = true; };
          }, [menuOpen, hints]);

          useEffect(() => {
            if (!menuOpen) return undefined;
            const onDown = (event) => {
              const menu = menuRef.current;
              const caret = caretRef.current;
              if (menu && typeof menu.contains === 'function' && menu.contains(event.target)) return;
              if (caret && typeof caret.contains === 'function' && caret.contains(event.target)) return;
              setMenuOpen(false);
            };
            const onKey = (event) => {
              if (event.key === 'Escape') setMenuOpen(false);
            };
            document.addEventListener('mousedown', onDown, true);
            document.addEventListener('keydown', onKey);
            return () => {
              document.removeEventListener('mousedown', onDown, true);
              document.removeEventListener('keydown', onKey);
            };
          }, [menuOpen]);

          const canRun = draft.trim() !== '' && !busy
            && inputActions !== undefined && typeof inputActions.setDraft === 'function';

          /* The revert stays available only while the box still holds what the
             enhancement wrote; once the author edits it, the draft is theirs. */
          const revertTarget = replaced.length > 0 && enhanced !== null && draft.trim() === enhanced
            ? replaced[replaced.length - 1]
            : null;

          const run = async () => {
            if (!canRun || !inputActions) return;
            const text = draft.trim();
            const controller = new AbortController();
            abortRef.current = controller;
            setBusy(true);
            setError(null);
            setMenuOpen(false);
            try {
              const response = await fetch(routeUrl(ROUTE), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ text, persona, context: context.trim(), brief: brief.trim() }),
                signal: controller.signal,
              });
              const payload = await response.json().catch(() => null);
              if (!response.ok || !payload || payload.ok !== true || typeof payload.text !== 'string') {
                const message = payload && payload.error && payload.error.message
                  ? payload.error.message
                  : t('failed');
                throw new Error(message);
              }
              if (!aliveRef.current) return;
              const answer = payload.text.trim();
              if (answer !== text) {
                setReplaced((previous) => previous.concat([text]).slice(-MAX_UNDO));
                setEnhanced(answer);
                inputActions.setDraft(answer);
              }
            } catch (failure) {
              if (!aliveRef.current) return;
              if (failure && failure.name === 'AbortError') return;
              setError(failure && failure.message ? failure.message : t('failed'));
            } finally {
              if (abortRef.current === controller) abortRef.current = null;
              if (aliveRef.current) setBusy(false);
            }
          };

          const revert = () => {
            if (revertTarget === null || busy) return;
            if (inputActions === undefined || typeof inputActions.setDraft !== 'function') return;
            setReplaced(replaced.slice(0, -1));
            setEnhanced(revertTarget);
            setError(null);
            inputActions.setDraft(revertTarget);
          };

          const openMenu = () => {
            if (menuOpen) {
              setMenuOpen(false);
              return;
            }
            const rect = caretRef.current && typeof caretRef.current.getBoundingClientRect === 'function'
              ? caretRef.current.getBoundingClientRect()
              : null;
            if (rect !== null && typeof window !== 'undefined') {
              /* Fit the menu into the space that is actually visible: the composer
                 owns the bottom of the screen and anything opening upward must not
                 run under it, so pick the roomier side and cap the height there. */
              const width = 304;
              const gap = 6;
              const vp = typeof window.visualViewport === 'object' && window.visualViewport !== null
                ? window.visualViewport
                : null;
              const vh = vp !== null ? vp.height : window.innerHeight;
              const vw = vp !== null ? vp.width : window.innerWidth;
              const left = Math.max(8, Math.min(rect.right - width, vw - width - 8));
              const above = Math.max(0, rect.top - 8);
              const below = Math.max(0, vh - rect.bottom - 8);
              const wanted = 520;
              if (above >= Math.min(wanted, 280) || above >= below) {
                const maxHeight = Math.max(180, Math.min(wanted, above));
                setMenuAt({ left, bottom: Math.max(8, vh - rect.top + gap), maxHeight });
              } else {
                const maxHeight = Math.max(160, Math.min(wanted, below));
                setMenuAt({ left, top: Math.min(rect.bottom + gap, Math.max(8, vh - maxHeight - 8)), maxHeight });
              }
            }
            setMenuOpen(true);
          };

          const choosePersona = (id) => {
            setPersona(id);
            writeStored(PERSONA_KEY, id);
            setMenuOpen(false);
          };

          const changeContext = (value) => {
            setContext(value);
            writeStored(CONTEXT_KEY, value);
          };

          const changeBrief = (value) => {
            setBrief(value);
            writeStored(BRIEF_KEY, value);
          };

          const resetContext = () => {
            setContext(DEFAULT_CONTEXT);
            writeStored(CONTEXT_KEY, DEFAULT_CONTEXT);
          };

          const active = personaWords(persona);
          const label = busy ? t('busy') : (draft.trim() === '' ? t('empty') : `${t('title')} · ${active.name}`);

          const glyph = busy
            ? h(SpinnerIcon, null)
            : (IconSparkle ? h(IconSparkle, { size: 15 }) : h(SparkleIcon, null));

          const button = h('button', {
            ref: buttonRef,
            type: 'button',
            className: 'dsh-pb-btn dsh-pb-main',
            'aria-label': label,
            'aria-busy': busy ? 'true' : 'false',
            'data-busy': busy ? 'true' : 'false',
            disabled: !canRun,
            title: Tooltip ? undefined : label,
            onMouseDown: (event) => event.preventDefault(),
            onClick: run,
          }, glyph);

          const wrapped = Tooltip
            ? h(Tooltip, { label, side: 'top', delayMs: 400 }, button)
            : button;

          const caretLabel = `${t('persona')} · ${active.name}`;
          const caretButton = h('button', {
            ref: caretRef,
            type: 'button',
            className: 'dsh-pb-btn dsh-pb-caret',
            'aria-label': caretLabel,
            'aria-haspopup': 'menu',
            'aria-expanded': menuOpen ? 'true' : 'false',
            title: Tooltip ? undefined : caretLabel,
            onMouseDown: (event) => event.preventDefault(),
            onClick: openMenu,
          }, h(ChevronIcon, null));

          const caretWrapped = Tooltip
            ? h(Tooltip, { label: caretLabel, side: 'top', delayMs: 500 }, caretButton)
            : caretButton;

          const items = PERSONAS.map((entry) => {
            const words = personaWords(entry.id);
            const checked = entry.id === persona;
            return h('button', {
              key: entry.id,
              type: 'button',
              role: 'menuitemradio',
              'aria-checked': checked ? 'true' : 'false',
              className: 'dsh-pb-item',
              onClick: () => choosePersona(entry.id),
            },
            h('span', { className: 'dsh-pb-glyph', 'aria-hidden': 'true' }, words.glyph),
            h('span', { className: 'dsh-pb-item-text' },
              h('span', { className: 'dsh-pb-item-name' }, words.name),
              h('span', { className: 'dsh-pb-item-hint' }, words.hint)),
            checked ? h('span', { className: 'dsh-pb-check', 'aria-hidden': 'true' }, h(CheckIcon, null)) : null);
          });

          const contextToggle = h('button', {
            type: 'button',
            className: 'dsh-pb-context-toggle',
            'aria-expanded': contextOpen ? 'true' : 'false',
            onClick: () => setContextOpen((value) => !value),
          },
          h('span', null, `${t('context')}`),
          h('span', { className: 'dsh-pb-context-state' }, context.trim() === '' ? t('contextEmpty') : (contextOpen ? t('contextHide') : t('contextEdit'))));

          const contextBody = contextOpen ? [
            h('div', { key: 'note', className: 'dsh-pb-context-note' }, t('contextHint')),
            h('textarea', {
              key: 'box',
              className: 'dsh-pb-context',
              value: context,
              spellCheck: false,
              rows: 5,
              onChange: (event) => changeContext(event.target.value),
            }),
            h('div', { key: 'actions', className: 'dsh-pb-context-actions' },
              h('button', { type: 'button', className: 'dsh-pb-reset', onClick: resetContext }, t('contextReset'))),
          ] : null;

          const briefBody = persona !== 'custom' ? null : h('div', { className: 'dsh-pb-brief' },
            h('div', { className: 'dsh-pb-context-label' }, t('brief')),
            h('div', { className: 'dsh-pb-context-note' }, t('briefHint')),
            h('textarea', {
              className: 'dsh-pb-context dsh-pb-brief-box',
              value: brief,
              spellCheck: false,
              rows: 3,
              placeholder: t('briefPlaceholder'),
              onChange: (event) => changeBrief(event.target.value),
            }));

          const menu = menuOpen ? h('div', {
            ref: menuRef,
            className: typeof menuAt.maxHeight === 'number' && menuAt.maxHeight < 420
              ? 'dsh-pb-menu dsh-pb-menu-grid'
              : 'dsh-pb-menu',
            role: 'menu',
            'aria-label': `${t('persona')} · ${t('personaHint')}`,
            style: {
              left: menuAt.left + 'px',
              ...(typeof menuAt.top === 'number'
                ? { top: menuAt.top + 'px' }
                : { bottom: menuAt.bottom + 'px' }),
              ...(typeof menuAt.maxHeight === 'number' ? { maxHeight: menuAt.maxHeight + 'px' } : {}),
            },
          },
          h('div', { className: 'dsh-pb-menu-head' }, h('span', null, t('persona')), h('small', null, t('personaHint'))),
          h('div', { className: 'dsh-pb-items' }, items),
          h('div', { className: 'dsh-pb-menu-foot' },
            h('div', { className: 'dsh-pb-hint', title: hints && hints.root ? hints.root : '' },
              `${t('hintLabel')}${hints && hints.summary ? hints.summary : (hints === null ? t('hintReading') : t('hintNone'))}`),
            briefBody,
            contextToggle,
            contextBody)) : null;

          const revertLabel = t('revertHint');
          const revertButton = revertTarget === null ? null : h('button', {
            type: 'button',
            className: 'dsh-pb-btn dsh-pb-revert',
            'aria-label': revertLabel,
            disabled: busy,
            title: Tooltip ? undefined : revertLabel,
            onMouseDown: (event) => event.preventDefault(),
            onClick: revert,
          }, h(UndoIcon, null));

          const revertWrapped = revertButton === null
            ? null
            : (Tooltip ? h(Tooltip, { label: t('revert'), side: 'top', delayMs: 400 }, revertButton) : revertButton);

          let bubble = null;
          if (error !== null && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            bubble = h('div', {
              className: 'dsh-pb-error',
              role: 'status',
              style: { left: rect.left + rect.width / 2 + 'px', top: rect.top - 6 + 'px' },
            }, error);
          }

          return h('span', { className: 'dsh-pb-wrap', 'data-dsh-prompt-boost': '' },
            wrapped, caretWrapped, menu, revertWrapped, bubble);
        }

        ctx.effect(() => {
          const style = document.createElement('style');
          style.setAttribute('data-dsh-prompt-boost', '');
          style.textContent = CSS;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'prompt-boost: styles');

        ctx.slots.inject(SLOT, () => ctx.slots.register({
          name: SLOT,
          id: 'prompt-boost',
          order: 20,
          label: () => t('title'),
          locale: NS,
        }, EnhanceButton));
      },
    };
  },
});
