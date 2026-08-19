import { $ } from '../dom/dom.js';
import { heroSdImagePath, RARITY_COLOR, heroRarityOf } from '../domain/heroCatalog.js';

let pendingProfileIcon = null; // 편집 중 임시 선택값. null = 기본 아이콘, 문자열이면 그 정령의 SD 초상화.

function renderProfileIconGrid(store) {
  const defaultTile = `
    <div class="hero-picker-item icon-mode${pendingProfileIcon === null ? ' selected' : ''}" data-name="">
      <div style="width:100%;height:100%;display:grid;place-items:center;font-size:22px">🌙</div>
    </div>
  `;
  const heroTiles = Object.keys(store.state.heroes).map(name => `
    <div class="hero-picker-item icon-mode${pendingProfileIcon === name ? ' selected' : ''}" data-name="${name}" style="border-color:${RARITY_COLOR[heroRarityOf(name)]}">
      <img src="${heroSdImagePath(name)}" alt="${name}">
    </div>
  `).join('');
  $('#profileIconGrid').innerHTML = defaultTile + heroTiles;
}

function openProfileEdit(store) {
  pendingProfileIcon = store.state.account.profileIcon;
  $('#profileNicknameInput').value = store.state.account.nickname;
  renderProfileIconGrid(store);
  $('#profileEditSheet').classList.add('open');
}

const DAILY_LABEL = {
  stageClears: '스테이지 5회 처치',
  heroLevelUp: '정령 레벨업 1회',
  summonOnce: '소환 1회 이상'
};
const WEEKLY_LABEL = {
  stageClears: '이번 주 스테이지 100회 처치',
  heroLevelUps: '정령 레벨업 10회',
  merges: '정령 합치기 5회',
  bountyWins: '현상 수배 성공 5회',
  towerFloors: '별자리 탑 5층 등반',
  labyrinthRuns: '꿈의 미궁 완주 1회'
};

function missionRow(key, mission, label) {
  const pct = Math.min(100, Math.round((mission.progress / mission.target) * 100));
  const canClaim = !mission.claimed && mission.progress >= mission.target;
  return `<div class="mission-item">
    <div class="mission-progress">
      <strong>${label}</strong>
      <span>${mission.progress} / ${mission.target}</span>
      <div class="mission-track"><div class="mission-fill" style="width:${pct}%"></div></div>
    </div>
    <button class="mission-claim" data-mission-key="${key}" ${canClaim ? '' : 'disabled'}>${mission.claimed ? '완료' : '수령'}</button>
  </div>`;
}

export function initMenuView({ store, toast, onChange }) {
  $('#openProfileEditBtn').addEventListener('click', () => openProfileEdit(store));

  $('#profileIconGrid').addEventListener('click', event => {
    const item = event.target.closest('.hero-picker-item');
    if (!item) return;
    pendingProfileIcon = item.dataset.name || null;
    renderProfileIconGrid(store);
  });

  $('#profileSaveBtn').addEventListener('click', () => {
    const result = store.setNickname($('#profileNicknameInput').value);
    if (!result.ok) { toast.show('닉네임을 입력해주세요.'); return; }
    store.setProfileIcon(pendingProfileIcon);
    $('#profileEditSheet').classList.remove('open');
    toast.show('프로필을 저장했습니다.');
    store.saveGame();
    onChange();
  });

  $('#saveNow').addEventListener('click', () => {
    const result = store.saveGame();
    if (result.ok) {
      $('#saveStatus').textContent = `자동 저장 완료 · ${new Date().toLocaleTimeString('ko-KR')}`;
      toast.show('현재 게임 상태를 저장했습니다.');
    } else {
      toast.show(`저장 실패: ${result.error.message}`);
    }
    onChange();
  });

  $('#exportSave').addEventListener('click', () => {
    const blob = new Blob([store.exportSaveText()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'starlight-save-v4.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.show('저장 파일을 내보냈습니다.');
  });

  $('#importSave').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('저장 파일은 1MB 이하여야 합니다.');
      store.importSaveText(await file.text());
      toast.show('저장 파일을 불러왔습니다.');
      onChange();
    } catch (error) {
      toast.show(`불러오기 실패: ${error.message}`);
    }
    event.target.value = '';
  });

  $('#checkInRow').addEventListener('click', () => {
    const result = store.checkIn();
    if (!result.ok) { toast.show('오늘은 이미 출석했어요.'); return; }
    toast.show(`출석 완료 · 이번 달 ${result.count}일째`);
    store.saveGame();
    onChange();
  });

  $('#monthlyEventRow').addEventListener('click', () => {
    const result = store.claimMonthlyEvent();
    if (!result.ok) { toast.show('이번 달 보상은 이미 받았어요.'); return; }
    toast.show('월간 이벤트 보상 · 별의 인연 +600');
    store.saveGame();
    onChange();
  });

  $('#seasonTrackRow').addEventListener('click', () => {
    const s = store.state.seasonTrack;
    const result = store.claimSeasonTier(s.claimedTier + 1);
    if (!result.ok) { toast.show(result.reason === 'locked' ? '아직 해금되지 않았어요.' : '이미 수령했어요.'); return; }
    toast.show(`시즌 무료 트랙 ${s.claimedTier}단계 수령 · 보석 +40`);
    store.saveGame();
    onChange();
  });

  $('#dailyMissionList').addEventListener('click', event => {
    const btn = event.target.closest('button[data-mission-key]');
    if (!btn) return;
    const result = store.claimDailyMission(btn.dataset.missionKey);
    if (!result.ok) return;
    toast.show('일일 임무 보상을 수령했습니다.');
    store.saveGame();
    onChange();
  });
  $('#weeklyMissionList').addEventListener('click', event => {
    const btn = event.target.closest('button[data-mission-key]');
    if (!btn) return;
    const result = store.claimWeeklyMission(btn.dataset.missionKey);
    if (!result.ok) return;
    toast.show('주간 임무 보상을 수령했습니다.');
    store.saveGame();
    onChange();
  });

  $('#exchangeShardBtn').addEventListener('click', () => {
    const result = store.exchangeMemoryStarsForShard('legendary');
    if (!result.ok) { toast.show(`기억의 별이 ${result.shortfall}개 부족해요.`); return; }
    toast.show('레전더리 조각 1개로 교환했습니다.');
    onChange();
  });
  $('#exchangePowderBtn').addEventListener('click', () => {
    const result = store.exchangeMemoryStarsForStarPowder();
    if (!result.ok) { toast.show(`기억의 별이 ${result.shortfall}개 부족해요.`); return; }
    toast.show('별가루 500개로 교환했습니다.');
    onChange();
  });
  $('#exchangeGoldBtn').addEventListener('click', () => {
    const result = store.exchangeMemoryStarsForGold();
    if (!result.ok) { toast.show(`기억의 별이 ${result.shortfall}개 부족해요.`); return; }
    toast.show('골드 500,000으로 교환했습니다.');
    onChange();
  });
}

export function refreshMenuView(store) {
  const s = store.state;
  $('#menuProfileNickname').textContent = s.account.nickname || '별지기';
  $('#menuProfileAvatar').innerHTML = s.account.profileIcon
    ? `<img src="${heroSdImagePath(s.account.profileIcon)}" alt="${s.account.profileIcon}">`
    : '🌙';
  $('#attendanceInfo').textContent = `이번 달 ${s.attendance.days.length}일 접속 · 오늘 ${s.attendance.days.includes(new Date().toISOString().slice(0, 10)) ? '완료' : '탭해서 출석'}`;
  const seasonDays = s.seasonTrack.cycleStart ? Math.floor((Date.now() - new Date(s.seasonTrack.cycleStart).getTime()) / 86400000) : 0;
  $('#seasonTrackInfo').textContent = `${s.seasonTrack.claimedTier} / 7 단계 수령 · 진행 ${seasonDays}일차`;

  $('#dailyMissionList').innerHTML = Object.entries(s.missions.daily).map(([key, m]) => missionRow(key, m, DAILY_LABEL[key] || key)).join('');
  $('#weeklyMissionList').innerHTML = Object.entries(s.missions.weekly).map(([key, m]) => missionRow(key, m, WEEKLY_LABEL[key] || key)).join('');

  $('#memoryStarInfo').textContent = `기억의 별 ${s.memoryStars}개 보유 — 최대 성급 정령의 중복 획득분으로 쌓입니다.`;
}
