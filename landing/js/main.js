// =====================================================================
  // Hero phone: full conversation per industry — message, 3 smart
  // questions, appointment booked, hot lead alert, owner notified.
  // =====================================================================
  const industries = [
    { tag:'Real Estate', icon:'🏠', turns:[
      {who:'out', text:"Hi, I'm looking for a 2-bedroom apartment in Dubai Marina."},
      {who:'in', text:"Great choice! Are you looking to buy or rent?"},
      {who:'out', text:"Rent."},
      {who:'in', text:"What's your monthly budget?"},
      {who:'out', text:"Around 8,000 AED."},
      {who:'in', text:"When would you like to move in?"},
      {who:'out', text:"Next month."},
      {who:'in', text:"Perfect — I've booked a viewing with our agent tomorrow at 4 PM."}
    ]},
    { tag:'Car Dealership', icon:'🚗', turns:[
      {who:'out', text:"Hi, I'm looking for a BMW X5."},
      {who:'in', text:"Welcome! Are you buying or financing?"},
      {who:'out', text:"Financing."},
      {who:'in', text:"What's your monthly budget?"},
      {who:'out', text:"3,000 AED."},
      {who:'in', text:"Would you like a test drive this week?"},
      {who:'out', text:"Yes, please."},
      {who:'in', text:"Perfect — I've scheduled a call with our sales advisor tomorrow at 3 PM."}
    ]},
    { tag:'Clinic', icon:'🏥', turns:[
      {who:'out', text:"I need teeth whitening."},
      {who:'in', text:"Sure! Have you visited us before?"},
      {who:'out', text:"No, first time."},
      {who:'in', text:"What day works best for you?"},
      {who:'out', text:"Tomorrow."},
      {who:'in', text:"Morning or evening?"},
      {who:'out', text:"Evening."},
      {who:'in', text:"Booked for tomorrow at 6 PM — a reminder has been set."}
    ]},
    { tag:'Salon', icon:'💇', turns:[
      {who:'out', text:"I want hair color tomorrow."},
      {who:'in', text:"Perfect! Morning or afternoon?"},
      {who:'out', text:"Afternoon."},
      {who:'in', text:"Any color in mind, or need a consultation?"},
      {who:'out', text:"Balayage please."},
      {who:'in', text:"Got it — how does 3 PM sound?"},
      {who:'out', text:"Works for me."},
      {who:'in', text:"Booked for tomorrow at 3 PM. See you then!"}
    ]},
    { tag:'Restaurant', icon:'🍽️', turns:[
      {who:'out', text:"Table for 6 tonight."},
      {who:'in', text:"Sure! What time would you like to arrive?"},
      {who:'out', text:"8 PM."},
      {who:'in', text:"Indoor or outdoor seating?"},
      {who:'out', text:"Outdoor."},
      {who:'in', text:"Any special occasion we should prepare for?"},
      {who:'out', text:"Just dinner, thanks."},
      {who:'in', text:"Reservation confirmed — table for 6 at 8 PM, outdoor seating."}
    ]}
  ];

  const chatBody = document.getElementById('heroChatBody');
  const industryTag = document.getElementById('industryTag');
  const floatCards = ['fc1','fc2','fc3','fc4','fc5','fc6'].map(id=>document.getElementById(id));
  let heroIndex = 0;
  let heroTimer = null;

  function pulseFloatCards(){
    floatCards.forEach((card, i)=>{
      setTimeout(()=>{
        card.style.boxShadow = '0 0 0 2px rgba(61,127,255,0.6), 0 14px 30px -12px rgba(0,0,0,0.6)';
        setTimeout(()=> card.style.boxShadow = '', 500);
      }, i * 180);
    });
  }

  function playHeroConversation(idx){
    const conv = industries[idx];
    industryTag.style.opacity = 0;
    setTimeout(()=>{ industryTag.textContent = `${conv.icon} ${conv.tag}`; industryTag.style.opacity = 1; }, 200);

    chatBody.innerHTML = '';
    conv.turns.forEach((turn, i)=>{
      const bubble = document.createElement('div');
      bubble.className = 'bubble ' + turn.who;
      bubble.textContent = turn.text;
      chatBody.appendChild(bubble);
      setTimeout(()=>{
        bubble.classList.add('show');
        chatBody.scrollTop = chatBody.scrollHeight;
      }, 300 + i * 420);
    });

    const chipDelay = 300 + conv.turns.length * 420 + 200;
    const chipRow = document.createElement('div');
    chipRow.className = 'chip-row';
    ['🔥 Hot Lead', '📅 Appointment Booked', '📲 Owner Notified'].forEach((label, i)=>{
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.textContent = label;
      chipRow.appendChild(chip);
      setTimeout(()=>{ chip.classList.add('show'); chatBody.scrollTop = chatBody.scrollHeight; }, chipDelay + i * 260);
    });
    chatBody.appendChild(chipRow);

    setTimeout(pulseFloatCards, chipDelay);
  }

  function cycleHero(){
    heroIndex = (heroIndex + 1) % industries.length;
    playHeroConversation(heroIndex);
  }
  playHeroConversation(0);
  heroTimer = setInterval(cycleHero, 9000);

  // =====================================================================
  // MARQUEE
  // =====================================================================
  const industryBadges = ['🏠 Real Estate','🚗 Car Dealers','🏥 Clinics','💇 Salons','🍽️ Restaurants','🏋️ Gyms','🛠️ Home Services'];
  document.getElementById('marqueeTrack').innerHTML = [...industryBadges, ...industryBadges].map(b=>`<div class="marquee-item">${b}</div>`).join('');

  // =====================================================================
  // BUILT-FOR GRID
  // =====================================================================
  const builtItems = [
    { ico:'🌐', title:'English + Arabic support' },
    { ico:'🇦🇪', title:'UAE-ready business templates' },
    { ico:'🕐', title:'24/7 AI employee' },
    { ico:'📋', title:'Lead capture' },
    { ico:'📅', title:'Appointment booking' },
    { ico:'📊', title:'Business dashboard' },
    { ico:'🔥', title:'Hot lead alerts' }
  ];
  document.getElementById('builtGrid').innerHTML = builtItems.map(v=>`
    <div class="glass built-card reveal"><div class="built-ico">${v.ico}</div><h3>${v.title}</h3></div>
  `).join('');

  // =====================================================================
  // DASHBOARD PREVIEW TABS
  // =====================================================================
  function switchDashTab(tab){
    document.querySelectorAll('.dash-tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===tab));
    document.getElementById('dashAdmin').classList.toggle('active', tab==='admin');
    document.getElementById('dashClient').classList.toggle('active', tab==='client');
    document.getElementById('browserUrl').textContent = tab==='admin' ? 'yesai.app/admin' : 'yesai.app/client';
  }

  // =====================================================================
  // LEAD FORM
  // =====================================================================
  document.querySelectorAll('.radio-opt').forEach(opt=>{
    opt.addEventListener('click', ()=>{
      document.querySelectorAll('.radio-opt').forEach(o=>{ o.style.borderColor='var(--glass-border)'; o.style.color='var(--ink-muted)'; });
      opt.style.borderColor='var(--blue)'; opt.style.color='#fff';
      opt.querySelector('input').checked = true;
    });
  });
  document.getElementById('leadForm').addEventListener('submit', function(e){
    e.preventDefault();
    this.style.display = 'none';
    document.getElementById('formSuccess').style.display = 'block';
  });

  // =====================================================================
  // FAQ ACCORDION
  // =====================================================================
  document.querySelectorAll('.faq-item').forEach(item=>{
    item.querySelector('.faq-q').addEventListener('click', ()=>{
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i=>i.classList.remove('open'));
      if(!wasOpen) item.classList.add('open');
    });
  });

  // =====================================================================
  // NAV SCROLL SHADOW + SCROLL REVEAL
  // =====================================================================
  const headerEl = document.getElementById('siteHeader');
  window.addEventListener('scroll', ()=> headerEl.classList.toggle('scrolled', window.scrollY > 8));

  const revealObserver = new IntersectionObserver((entries)=>{
    entries.forEach((entry)=>{
      if(entry.isIntersecting){
        const siblings = Array.from(entry.target.parentElement.children).filter(c=>c.classList.contains('reveal'));
        const order = siblings.indexOf(entry.target);
        setTimeout(()=> entry.target.classList.add('in'), Math.max(0, order) * 70);
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold:0.12, rootMargin:'0px 0px -40px 0px' });
  setTimeout(()=> document.querySelectorAll('.reveal').forEach(el=> revealObserver.observe(el)), 50);
