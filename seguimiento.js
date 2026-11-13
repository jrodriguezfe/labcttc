// ════════════════════════════════════════════════════════════════
//  seguimiento.js — Sistema de seguimiento de muestras - Lab CTTC
// ════════════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore, collection, addDoc, getDocs, getDoc, updateDoc,
    doc, query, orderBy, arrayUnion, Timestamp, where, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ── Firebase config (igual que script.js) ──────────────────────
const firebaseConfig = {
    apiKey:            "AIzaSyBR88EcYJPL3xIdr5X_p8cx2TEjz7LuzpM",
    authDomain:        "lab-cttc.firebaseapp.com",
    projectId:         "lab-cttc",
    storageBucket:     "lab-cttc.appspot.com",
    messagingSenderId: "588785890026",
    appId:             "1:588785890026:web:27ec4ea43a8a749989dd93"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── Estado global ───────────────────────────────────────────────
let currentUser           = null;
let currentUserRole       = 'analista'; // 'analista' (solo etapas 1 a 5) o 'admin' (visión total)
let initialized           = false;
let activeScanner         = null; // { instance, wrapperId }
let lastCreatedId         = null;
let modalMuestraId        = null;
let muestraActiva         = null; // { id, ...data } para el flujograma interactivo
let _todasMuestras        = [];
const _cacheClientesPorRuc = new Map();

const stageSampleIds = {
    acond:   null,
    ensayo:  null,
    informe: null,
    cierre:  null
};

// Configuración unificada de etapas con escáner/búsqueda (Etapas 2-5)
const STAGE_CONFIG = {
    acond: {
        tabId:         'tab-acondicionamiento',
        inputId:       'idMuestraAcond',
        alertId:       'alertAcond',
        inlineAlertId: 'statusAcondInline',
        infoId:        'infoMuestraAcond',
        clienteId:     'datosClienteAcond',
        scanBtnId:     'btnScanAcond',
        stopBtnId:     'btnStopScanAcond',
        findBtnId:     'btnBuscarAcond',
        wrapperId:     'scannerAcond',
        readerId:      'readerAcond'
    },
    ensayo: {
        tabId:         'tab-ensayo',
        inputId:       'idMuestraEnsayo',
        alertId:       'alertEnsayo',
        inlineAlertId: 'statusEnsayoInline',
        infoId:        'infoMuestraEnsayo',
        clienteId:     'datosClienteEnsayo',
        scanBtnId:     'btnScanEnsayo',
        stopBtnId:     'btnStopScanEnsayo',
        findBtnId:     'btnBuscarEnsayo',
        wrapperId:     'scannerEnsayo',
        readerId:      'readerEnsayo'
    },
    informe: {
        tabId:         'tab-informe',
        inputId:       'idMuestraInforme',
        alertId:       'alertInforme',
        inlineAlertId: 'statusInformeInline',
        infoId:        'infoMuestraInforme',
        clienteId:     'datosClienteInforme',
        scanBtnId:     'btnScanInforme',
        stopBtnId:     'btnStopScanInforme',
        findBtnId:     'btnBuscarInforme',
        wrapperId:     'scannerInforme',
        readerId:      'readerInforme'
    },
    cierre: {
        tabId:         'tab-cierre',
        inputId:       'idMuestraCierre',
        alertId:       'alertCierre',
        inlineAlertId: 'statusCierreInline',
        infoId:        'infoMuestraCierre',
        clienteId:     'datosClienteCierre',
        scanBtnId:     'btnScanCierre',
        stopBtnId:     'btnStopScanCierre',
        findBtnId:     'btnBuscarCierre',
        wrapperId:     'scannerCierre',
        readerId:      'readerCierre'
    }
};

// ════════════════════════════════════════════════════════════════
//  RESOLUCIÓN DE ROL DESDE COLECCIÓN 'ANALISTAS'
// ════════════════════════════════════════════════════════════════
function clasificarRol(texto) {
    if (!texto) return null;
    const t = String(texto).toLowerCase().trim();
    if (t === 'admin' || t === 'administrador' || t.startsWith('admin') || t.includes('administrador')) {
        return 'admin';
    }
    if (t === 'visor' || t.includes('visor')) {
        return 'visor';
    }
    if (t === 'analista' || t === 'analistas' || t.includes('analista')) {
        return 'analista';
    }
    return null;
}

function obtenerRolDesdeDoc(data) {
    if (!data) return 'analista';

    // 1. Prioridad: campo 'descripcion' (especificado en Firestore)
    const rolDesc = clasificarRol(data.descripcion);
    if (rolDesc) return rolDesc;

    // 2. Campo 'rol'
    const rolRol = clasificarRol(data.rol);
    if (rolRol) return rolRol;

    // 3. Campo 'cargo'
    const rolCargo = clasificarRol(data.cargo);
    if (rolCargo) return rolCargo;

    // 4. Campo 'role' o 'tipo'
    const rolRole = clasificarRol(data.role || data.tipo);
    if (rolRole) return rolRole;

    return 'analista';
}

async function resolverUsuarioAnalista(user) {
    if (!user) return { rol: 'analista', nombre: 'Analista' };

    const emailUser = (user.email || '').toLowerCase().trim();
    const uidUser   = (user.uid || '').trim();

    let docData = null;

    try {
        // A. Buscar primero por ID de documento = user.uid
        if (uidUser) {
            const snapUid = await getDoc(doc(db, 'analistas', uidUser));
            if (snapUid.exists()) {
                docData = snapUid.data();
            }
        }

        // B. Si no coincidió por ID directo, revisar colección 'analistas' para buscar por uid, email o id
        if (!docData) {
            const snapAll = await getDocs(collection(db, 'analistas'));
            snapAll.forEach(d => {
                if (docData) return;
                const dData = d.data();
                const dEmail = (dData.email || dData.correo || '').toLowerCase().trim();
                const dUid   = (dData.uid || '').trim();
                const dId    = d.id.toLowerCase().trim();

                if (d.id === uidUser || dUid === uidUser) {
                    docData = dData;
                } else if (emailUser && (dEmail === emailUser || dId === emailUser)) {
                    docData = dData;
                }
            });
        }
    } catch (err) {
        console.warn('Error resolviendo usuario en colección analistas:', err);
    }

    if (!docData) {
        return {
            rol: 'analista',
            nombre: user.displayName || user.email || 'Analista'
        };
    }

    const rol = obtenerRolDesdeDoc(docData);
    const nombre = (docData.nombre || docData.displayName || user.displayName || user.email || 'Analista').trim();

    return { rol, nombre, data: docData };
}

// ════════════════════════════════════════════════════════════════
//  AUTH & PERMISOS POR ROL
// ════════════════════════════════════════════════════════════════
onAuthStateChanged(auth, async user => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-check').style.display = 'none';
        document.getElementById('appShell').style.display   = 'flex';

        // Determinar rol exacto desde la colección 'analistas' (evaluando descripcion, rol, cargo)
        const infoAnalista = await resolverUsuarioAnalista(user);
        currentUserRole    = infoAnalista.rol;

        document.getElementById('userDisplay').textContent = infoAnalista.nombre;
        const badgeEl = document.getElementById('roleBadgeContainer');
        if (badgeEl) {
            const badgeColor = (currentUserRole === 'admin') ? '#d35400' : '#27ae60';
            badgeEl.innerHTML = `<span style="font-size:0.75rem; background:${badgeColor}; color:#fff; padding:2px 8px; border-radius:10px; font-weight:600; margin-left:4px;">${currentUserRole.toUpperCase()}</span>`;
        }

        // Aplicar permisos estrictos:
        // - Admin: visión total permanente (todas las etapas + listado + dashboard)
        // - Analista: solo ve las etapas del proceso (1, 2, 3, 4, 5)
        aplicarPermisosPorRol(currentUserRole);

        if (!initialized) {
            initialized = true;
            init();
        }
        const params = new URLSearchParams(window.location.search);
        const urlId  = params.get('id');
        const urlTab = params.get('tab');
        if (urlId) {
            cargarMuestraEnEtapa(urlId, 'acond');
        } else if (urlTab === 'dashboard' && currentUserRole === 'admin') {
            activarTab('tab-dashboard');
        }
    } else {
        currentUser = null;
        currentUserRole = 'analista';
        detenerScannerActivo();
        aplicarPermisosPorRol('analista');
        document.getElementById('auth-check').style.display = 'block';
        document.getElementById('appShell').style.display   = 'none';
    }
});

function aplicarPermisosPorRol(rol) {
    const esAdmin = (rol === 'admin');

    if (esAdmin) {
        document.body.classList.remove('rol-analista');
        document.body.classList.add('rol-admin');
        document.querySelectorAll('.tab-admin-only').forEach(btn => {
            btn.removeAttribute('hidden');
            btn.style.setProperty('display', 'inline-block', 'important');
        });
        document.querySelectorAll('.pane-admin-only').forEach(pane => {
            pane.removeAttribute('hidden');
        });
    } else {
        document.body.classList.remove('rol-admin');
        document.body.classList.add('rol-analista');
        document.querySelectorAll('.tab-admin-only').forEach(btn => {
            btn.setAttribute('hidden', 'true');
            btn.style.setProperty('display', 'none', 'important');
        });
        document.querySelectorAll('.pane-admin-only').forEach(pane => {
            pane.setAttribute('hidden', 'true');
            pane.style.setProperty('display', 'none', 'important');
        });
        // Si el usuario analista estaba en listado o dashboard, redirigir a Etapa 1
        const tabActual = getActiveTabId();
        if (tabActual === 'tab-listado' || tabActual === 'tab-dashboard') {
            activarTab('tab-registro');
        }
    }
}

document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const pass  = document.getElementById('loginPass').value;
    const errEl = document.getElementById('loginError');
    errEl.style.display = 'none';
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch {
        errEl.style.display = 'block';
    }
});

document.getElementById('btnLogout').addEventListener('click', () => signOut(auth));

// ════════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════════
function init() {
    [iniciarTabs, iniciarReloj, cargarAnalistas, iniciarTab1, iniciarEtapasConScanner, iniciarTab6Listado, iniciarDashboard, iniciarModal]
        .forEach(fn => {
            try {
                fn();
            } catch (err) {
                console.error(`Error inicializando ${fn.name}:`, err);
            }
        });
}

// ════════════════════════════════════════════════════════════════
//  TABS
// ════════════════════════════════════════════════════════════════
function getActiveTabId() {
    const active = document.querySelector('.tab-btn.active');
    return active ? active.dataset.tab : 'tab-registro';
}

function activarTab(tabId, skipAutoLoad = false) {
    // Los analistas solo tienen acceso a las etapas 1 a 5
    if (currentUserRole !== 'admin' && (tabId === 'tab-listado' || tabId === 'tab-dashboard')) {
        tabId = 'tab-registro';
    }

    detenerScannerActivo();
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    const btn  = document.querySelector(`[data-tab="${tabId}"]`);
    const pane = document.getElementById(tabId);
    if (btn)  btn.classList.add('active');
    if (pane) pane.classList.add('active');

    if (tabId === 'tab-listado') cargarListado();
    if (tabId === 'tab-dashboard') cargarDashboard();

    if (!skipAutoLoad && muestraActiva?.id) {
        const entry = Object.entries(STAGE_CONFIG).find(([, cfg]) => cfg.tabId === tabId);
        if (entry) {
            const [stageKey, cfg] = entry;
            const inp = document.getElementById(cfg.inputId);
            if (inp && !inp.value.trim()) {
                inp.value = muestraActiva.id;
                buscarMuestraEtapa(stageKey);
                return;
            }
        }
    }

    if (muestraActiva) {
        actualizarFlujogramaActivo(muestraActiva);
    }
}

function iniciarTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => activarTab(btn.dataset.tab));
    });
}

// ════════════════════════════════════════════════════════════════
//  RELOJ — actualiza fechas en los 5 inputs readonly
// ════════════════════════════════════════════════════════════════
function iniciarReloj() {
    const dateInputIds = ['fechaRegistro', 'fechaAcond', 'fechaEnsayo', 'fechaInforme', 'fechaCierre'];
    function actualizar() {
        const ahora = fechaHoraStr(new Date());
        dateInputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = ahora;
        });
    }
    actualizar();
    setInterval(actualizar, 1000);
}

function fechaHoraStr(d) {
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ════════════════════════════════════════════════════════════════
//  ANALISTAS — cargar en todos los dropdowns
// ════════════════════════════════════════════════════════════════
async function cargarAnalistas() {
    const items = [];
    try {
        const snap = await getDocs(collection(db, 'analistas'));
        snap.forEach(d => {
            const { nombre, email, cargo } = d.data();
            const nom = (nombre || email || d.id || '').trim();
            if (nom) {
                items.push({ id: d.id, nombre: nom, cargo: cargo || '' });
            }
        });
    } catch (err) {
        console.warn('No se pudo listar colección analistas (se usará respaldo):', err);
        if (currentUser) {
            try {
                const ownSnap = await getDoc(doc(db, 'analistas', currentUser.uid));
                if (ownSnap.exists()) {
                    const { nombre, email, cargo } = ownSnap.data();
                    items.push({
                        id:     currentUser.uid,
                        nombre: (nombre || email || currentUser.email || '').trim(),
                        cargo:  cargo || ''
                    });
                }
            } catch { /* ignorar respaldo */ }
        }
    }

    if (items.length === 0 && currentUser) {
        items.push({
            id:     currentUser.uid,
            nombre: currentUser.displayName || currentUser.email,
            cargo:  'Usuario actual'
        });
    }

    items.sort((a, b) => a.nombre.localeCompare(b.nombre));

    const selectIds = ['analistaAcond', 'analistaEnsayo', 'analistaInforme', 'analistaCierre', 'dashFiltroAnalista'];
    selectIds.forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const prevVal = sel.value;
        const placeholder = id === 'analistaCierre'
            ? '— Seleccione analista / responsable —'
            : (id === 'dashFiltroAnalista' ? 'Todos los analistas' : '— Seleccione analista —');
        const opts = [`<option value="">${placeholder}</option>`];
        items.forEach(item => {
            const label = id === 'dashFiltroAnalista'
                ? item.nombre
                : (item.cargo ? `${item.nombre} — ${item.cargo}` : item.nombre);
            const val = id === 'dashFiltroAnalista' ? item.nombre : item.id;
            opts.push(`<option value="${esc(val)}" data-nombre="${esc(item.nombre)}">${esc(label)}</option>`);
        });
        if (id !== 'dashFiltroAnalista') {
            opts.push('<option value="__manual__">✍️ Otro analista (ingresar nombre)...</option>');
        }
        sel.innerHTML = opts.join('');
        if (prevVal && Array.from(sel.options).some(o => o.value === prevVal)) {
            sel.value = prevVal;
        }
        if (id !== 'dashFiltroAnalista' && !sel.dataset.manualBound) {
            sel.dataset.manualBound = '1';
            sel.addEventListener('change', () => {
                const manualInp = document.getElementById(`${id}Manual`);
                if (!manualInp) return;
                const esManual = sel.value === '__manual__';
                manualInp.style.display = esManual ? 'block' : 'none';
                if (esManual) manualInp.focus();
            });
        }
    });
}

// ════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════
function esc(val) {
    return String(val ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function mostrarAlerta(id, msg, tipo = 'success', shouldScroll = true) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent   = msg;
    el.className     = `alert alert-${tipo}`;
    el.style.display = 'block';
    if (shouldScroll) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch { /* noop */ }
    }
    const ms = tipo === 'danger' ? 10000 : 6000;
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, ms);
}

function notificarEtapa(stageKey, msg, tipo = 'success') {
    const cfg = STAGE_CONFIG[stageKey];
    if (!cfg) return;
    mostrarAlerta(cfg.alertId, msg, tipo, false);
    mostrarAlerta(cfg.inlineAlertId, msg, tipo, true);
}

function getNombreAnalista(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return { id: '', nombre: '' };
    if (sel.value === '__manual__') {
        const manualVal = (document.getElementById(`${selectId}Manual`)?.value || '').trim();
        return {
            id:     manualVal ? `manual:${manualVal}` : '',
            nombre: manualVal
        };
    }
    const opt = sel.options[sel.selectedIndex];
    return {
        id:     sel.value,
        nombre: opt ? (opt.dataset.nombre || opt.text) : ''
    };
}

function extraerIdMuestra(raw) {
    const val = (raw || '').trim();
    if (!val) return '';
    try {
        const url = new URL(val);
        const qId = url.searchParams.get('id');
        if (qId) return qId.trim();
    } catch {
        const m = val.match(/[?&]id=([^&]+)/);
        if (m && m[1]) return decodeURIComponent(m[1]).trim();
    }
    return val;
}

function tsToStr(ts) {
    if (!ts) return '';
    if (ts.toDate) return fechaHoraStr(ts.toDate());
    if (typeof ts === 'string') return ts;
    return String(ts);
}

function obtenerUltimaEntrega(muestra) {
    const entregas = Array.isArray(muestra.entregasInforme) ? muestra.entregasInforme : [];
    if (entregas.length === 0) {
        return muestra.inicioInformeFinal || null;
    }
    // El último analista según timestampMs (o el último elemento registrado)
    return entregas.reduce((latest, cur) => {
        if (!latest) return cur;
        return (cur.timestampMs || 0) >= (latest.timestampMs || 0) ? cur : latest;
    }, null);
}

// Apuntar siempre a la URL de producción en GitHub Pages para que el QR sea universal
const GITHUB_PAGES_SEGUIMIENTO_URL = 'https://jrodriguezfe.github.io/labcttc/seguimiento.html';

function generarUrlQr(docId) {
    return `${GITHUB_PAGES_SEGUIMIENTO_URL}?id=${encodeURIComponent(docId)}`;
}

function generarQrImgHtml(docId) {
    const url = generarUrlQr(docId);
    const qr  = window.qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return qr.createImgTag(5, 10);
}

function descargarQrDesdeContenedor(containerSelector, docId) {
    const img = document.querySelector(`${containerSelector} img`);
    if (!img) return;
    const a    = document.createElement('a');
    a.href     = img.src;
    a.download = `QR_muestra_${docId || 'muestra'}.png`;
    a.click();
}

// ════════════════════════════════════════════════════════════════
//  FLUJOGRAMA INTERACTIVO (5 ETAPAS)
// ════════════════════════════════════════════════════════════════
function actualizarFlujogramaActivo(muestra) {
    muestraActiva = muestra;
    const card = document.getElementById('flowchartActivoCard');
    if (!muestra || !muestra.id) {
        card.style.display = 'none';
        return;
    }
    card.style.display = 'block';
    document.getElementById('flowchartMuestraTitulo').textContent =
        `${muestra.razonSocial || 'Sin razón social'} (RUC: ${muestra.ruc || '—'})`;
    renderFlujograma('flowchartActivoContainer', muestra, getActiveTabId(), false);
}

function renderFlujograma(containerId, muestra, activeTabId = '', insideModal = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const ensayos  = Array.isArray(muestra.ensayos) ? muestra.ensayos : [];
    const entregas = Array.isArray(muestra.entregasInforme) ? muestra.entregasInforme : [];
    const ultimaEntrega = obtenerUltimaEntrega(muestra);
    const cierre   = muestra.cierreFinal;

    const st1 = 'completado';
    const st2 = muestra.acondicionamiento?.fecha ? 'completado' : 'en-curso';
    const st3 = ensayos.length > 0
        ? 'completado'
        : (st2 === 'completado' ? 'en-curso' : 'pendiente');
    const st4 = ultimaEntrega?.fecha
        ? 'completado'
        : (st3 === 'completado' ? 'en-curso' : 'pendiente');
    const st5 = cierre?.confirmado
        ? 'completado'
        : (st4 === 'completado' ? 'en-curso' : 'pendiente');

    const pasos = [
        {
            num: 1,
            icono: '📝',
            label: 'Creación de Cliente',
            tabId: 'tab-registro',
            stageKey: 'qr',
            estado: st1,
            info: `${muestra.razonSocial || '—'} | RUC: ${muestra.ruc || '—'}`,
            fecha: muestra.fechaCreacion ? tsToStr(muestra.fechaCreacion) : ''
        },
        {
            num: 2,
            icono: '🏷️',
            label: 'Sala Acondicionamiento',
            tabId: 'tab-acondicionamiento',
            stageKey: 'acond',
            estado: st2,
            info: st2 === 'completado'
                ? `Analista: ${muestra.acondicionamiento.analista || '—'}`
                : 'Escanear QR al dejar muestra',
            fecha: st2 === 'completado' ? (muestra.acondicionamiento.fecha || '') : ''
        },
        {
            num: 3,
            icono: '🧪',
            label: `Inicio de Ensayo (${ensayos.length})`,
            tabId: 'tab-ensayo',
            stageKey: 'ensayo',
            estado: st3,
            info: ensayos.length > 0
                ? `Último: ${ensayos[ensayos.length - 1]?.analista || '—'}`
                : (st3 === 'en-curso' ? 'Listo para ensayo (N×)' : 'Pendiente'),
            fecha: ensayos.length > 0 ? (ensayos[ensayos.length - 1]?.fecha || '') : '',
            arrowBadge: 'N×'
        },
        {
            num: 4,
            icono: '📊',
            label: `Inicio Informe Final (${entregas.length})`,
            tabId: 'tab-informe',
            stageKey: 'informe',
            estado: st4,
            info: ultimaEntrega?.fecha
                ? `Último analista: ${ultimaEntrega.analista || '—'}`
                : (st4 === 'en-curso' ? 'Esperando entregas (N analistas)' : 'Pendiente'),
            fecha: ultimaEntrega?.fecha || '',
            arrowBadge: 'Últ. analista'
        },
        {
            num: 5,
            icono: '📨',
            label: 'Cierre y Envío al Cliente',
            tabId: 'tab-cierre',
            stageKey: 'cierre',
            estado: st5,
            info: cierre?.confirmado
                ? `Enviado${cierre.responsable ? ` por ${cierre.responsable}` : ''}`
                : (st5 === 'en-curso' ? 'Listo para concluir y enviar' : 'Pendiente'),
            fecha: cierre?.fecha || ''
        }
    ];

    let completadas = 1;
    if (st2 === 'completado') completadas++;
    if (st3 === 'completado') completadas++;
    if (st4 === 'completado') completadas++;
    if (st5 === 'completado') completadas++;
    const progreso = Math.round((completadas / 5) * 100);

    let html = `
        <div style="margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; font-size:0.82rem; color:#555; margin-bottom:4px;">
                <span>Progreso general (${completadas}/5 etapas)</span><span><strong>${progreso}%</strong></span>
            </div>
            <div class="progress-bar-wrap">
                <div class="progress-bar-fill" style="width:${progreso}%"></div>
            </div>
        </div>
        <div class="flowchart">
    `;

    pasos.forEach((p, i) => {
        const isActive = activeTabId === p.tabId ? ' active-stage' : '';
        html += `
            <div class="flow-step">
                <div class="flow-node estado-${p.estado}${isActive}"
                     data-stage-key="${p.stageKey}"
                     data-sample-id="${esc(muestra.id || '')}"
                     title="Clic para abrir etapa ${p.num}">
                    <span class="node-step-num">Etapa ${p.num}</span>
                    <div class="node-icon">${p.icono}</div>
                    <div class="node-label">${esc(p.label)}</div>
                    <span class="node-status">${estadoLabel(p.estado)}</span>
                    <div class="node-date">${esc(p.info)}</div>
                    ${p.fecha ? `<div class="node-date">📅 ${esc(p.fecha)}</div>` : ''}
                </div>
            </div>
        `;
        if (i < pasos.length - 1) {
            const badge = pasos[i + 1].arrowBadge
                ? `<span class="flow-arrow-badge">${pasos[i + 1].arrowBadge}</span>`
                : '';
            html += `<div class="flow-arrow"><span>➔</span>${badge}</div>`;
        }
    });

    html += '</div>';
    container.innerHTML = html;

    // Interactividad: clic en cualquier nodo del flujograma
    container.querySelectorAll('.flow-node').forEach(node => {
        node.addEventListener('click', () => {
            const key = node.dataset.stageKey;
            const id  = node.dataset.sampleId;
            if (insideModal) cerrarModal();
            if (key === 'qr') {
                if (id) abrirModalDetalle(id);
                else activarTab('tab-registro');
            } else if (id) {
                cargarMuestraEnEtapa(id, key);
            } else {
                activarTab(STAGE_CONFIG[key].tabId);
            }
        });
    });
}

function estadoLabel(e) {
    return {
        completado: '✅ Completado',
        'en-curso': '🔵 En curso',
        pendiente:  '⏳ Pendiente'
    }[e] || e;
}

// ════════════════════════════════════════════════════════════════
//  TAB 1 — REGISTRO / CREACIÓN DE CLIENTE
// ════════════════════════════════════════════════════════════════
async function buscarClientePorRuc(rucLimpio, rucRaw = '') {
    if (!rucLimpio || rucLimpio.length !== 11) return null;

    // 1. Memoria rápida local
    if (_cacheClientesPorRuc.has(rucLimpio)) {
        return _cacheClientesPorRuc.get(rucLimpio);
    }

    // 2. Si las muestras ya se cargaron en memoria
    if (Array.isArray(_todasMuestras) && _todasMuestras.length > 0) {
        const found = _todasMuestras.find(m => (m.ruc || '').replace(/\D/g, '') === rucLimpio && m.razonSocial);
        if (found && found.razonSocial) {
            _cacheClientesPorRuc.set(rucLimpio, found.razonSocial);
            return found.razonSocial;
        }
    }

    // 3. Consulta en Firestore
    try {
        const q1 = query(
            collection(db, 'seguimiento_muestras'),
            where('ruc', '==', rucLimpio),
            limit(1)
        );
        const snap1 = await getDocs(q1);
        if (!snap1.empty) {
            const razon = snap1.docs[0].data()?.razonSocial || null;
            if (razon) {
                _cacheClientesPorRuc.set(rucLimpio, razon);
                return razon;
            }
        }

        if (rucRaw && rucRaw.trim() !== rucLimpio) {
            const q2 = query(
                collection(db, 'seguimiento_muestras'),
                where('ruc', '==', rucRaw.trim()),
                limit(1)
            );
            const snap2 = await getDocs(q2);
            if (!snap2.empty) {
                const razon = snap2.docs[0].data()?.razonSocial || null;
                if (razon) {
                    _cacheClientesPorRuc.set(rucLimpio, razon);
                    return razon;
                }
            }
        }
    } catch (err) {
        console.warn('Error al consultar RUC en Firestore:', err);
    }

    return null;
}

function iniciarTab1() {
    const rucInput   = document.getElementById('ruc');
    const razonInput = document.getElementById('razonSocial');
    const rucAyuda   = document.getElementById('rucAyuda');

    let debounceTimer = null;
    let ultimoRucConsultado = '';

    async function autocompletarSiExiste(forzar = false) {
        if (!rucInput || !razonInput) return;
        const raw    = rucInput.value.trim();
        const limpio = raw.replace(/\D/g, '');

        if (limpio.length !== 11) {
            if (rucAyuda) {
                rucAyuda.style.display = 'none';
                rucAyuda.textContent = '';
            }
            return;
        }

        if (!forzar && limpio === ultimoRucConsultado) return;
        ultimoRucConsultado = limpio;

        if (rucAyuda) {
            rucAyuda.style.display = 'block';
            rucAyuda.style.color = '#555';
            rucAyuda.textContent = '🔍 Verificando RUC en registros previos...';
        }

        const razonEncontrada = await buscarClientePorRuc(limpio, raw);
        if (razonEncontrada) {
            razonInput.value = razonEncontrada;
            razonInput.style.transition = 'background-color 0.4s ease';
            razonInput.style.backgroundColor = '#e8f5e9';
            setTimeout(() => { razonInput.style.backgroundColor = ''; }, 1200);

            if (rucAyuda) {
                rucAyuda.style.display = 'block';
                rucAyuda.style.color = '#217346';
                rucAyuda.textContent = `✓ Cliente recurrente: Razón Social autocompletada.`;
            }
        } else {
            if (rucAyuda) {
                rucAyuda.style.display = 'block';
                rucAyuda.style.color = '#004a8f';
                rucAyuda.textContent = 'ℹ️ RUC nuevo: complete la Razón Social a continuación.';
            }
        }
    }

    rucInput?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const limpio = rucInput.value.replace(/\D/g, '');
        if (limpio.length === 11) {
            debounceTimer = setTimeout(() => autocompletarSiExiste(), 200);
        } else {
            ultimoRucConsultado = '';
            if (rucAyuda) rucAyuda.style.display = 'none';
        }
    });

    rucInput?.addEventListener('blur', () => {
        clearTimeout(debounceTimer);
        autocompletarSiExiste(true);
    });

    document.getElementById('btnRegistrar').addEventListener('click', registrarMuestra);
    document.getElementById('btnDescQR').addEventListener('click', () => {
        descargarQrDesdeContenedor('#qrImagen', lastCreatedId);
    });
    document.getElementById('btnIrAcondDesdeQR')?.addEventListener('click', () => {
        if (lastCreatedId) cargarMuestraEnEtapa(lastCreatedId, 'acond');
    });
}

async function registrarMuestra() {
    const ruc         = document.getElementById('ruc').value.trim();
    const razonSocial = document.getElementById('razonSocial').value.trim();
    const desc        = document.getElementById('descMuestra').value.trim();

    if (!ruc || !razonSocial) {
        mostrarAlerta('alertReg', '⚠️ Ingrese RUC y Razón Social antes de continuar.', 'danger');
        return;
    }
    if (!/^\d{11}$/.test(ruc.replace(/\D/g, ''))) {
        mostrarAlerta('alertReg', '⚠️ El RUC debe tener 11 dígitos numéricos.', 'danger');
        return;
    }

    const btn = document.getElementById('btnRegistrar');
    btn.disabled = true;
    btn.textContent = '⏳ Guardando...';

    try {
        const ahoraTs = Timestamp.now();
        const docData = {
            razonSocial,
            ruc,
            descripcion:       desc,
            fechaCreacion:     ahoraTs,
            creadoPor:         currentUser.email,
            acondicionamiento: null,
            ensayos:           [],
            entregasInforme:   [],
            inicioInformeFinal: null,
            cierreFinal:       null
        };
        const docRef = await addDoc(collection(db, 'seguimiento_muestras'), docData);

        _cacheClientesPorRuc.set(ruc.replace(/\D/g, ''), razonSocial);
        const rucAyuda = document.getElementById('rucAyuda');
        if (rucAyuda) {
            rucAyuda.style.display = 'none';
            rucAyuda.textContent = '';
        }

        lastCreatedId = docRef.id;
        const qrUrl = generarUrlQr(docRef.id);
        document.getElementById('qrResultado').style.display = 'block';
        document.getElementById('qrImagen').innerHTML        = generarQrImgHtml(docRef.id);
        document.getElementById('qrIdTexto').textContent     = docRef.id;
        const qrUrlEl = document.getElementById('qrUrlTexto');
        if (qrUrlEl) {
            qrUrlEl.href = qrUrl;
            qrUrlEl.textContent = qrUrl;
        }

        mostrarAlerta('alertReg', '✅ Muestra registrada correctamente. Escanee el QR para continuar.', 'success');

        document.getElementById('ruc').value         = '';
        document.getElementById('razonSocial').value = '';
        document.getElementById('descMuestra').value = '';

        actualizarFlujogramaActivo({ id: docRef.id, ...docData });
    } catch (err) {
        console.error(err);
        mostrarAlerta('alertReg', '❌ Error al guardar: ' + err.message, 'danger');
    }

    btn.disabled = false;
    btn.textContent = '✅ Registrar Muestra y Generar QR';
}

// ════════════════════════════════════════════════════════════════
//  ETAPAS 2, 3, 4 y 5 — BÚSQUEDA Y ESCÁNER UNIFICADOS
// ════════════════════════════════════════════════════════════════
function iniciarEtapasConScanner() {
    Object.entries(STAGE_CONFIG).forEach(([key, cfg]) => {
        document.getElementById(cfg.findBtnId).addEventListener('click', () => buscarMuestraEtapa(key));
        document.getElementById(cfg.inputId).addEventListener('keydown', e => {
            if (e.key === 'Enter') buscarMuestraEtapa(key);
        });
        document.getElementById(cfg.scanBtnId).addEventListener('click', () => {
            iniciarScanner(cfg.wrapperId, cfg.readerId, cfg.inputId, () => buscarMuestraEtapa(key));
        });
        document.getElementById(cfg.stopBtnId).addEventListener('click', detenerScannerActivo);
    });

    document.getElementById('btnGuardarAcond').addEventListener('click', guardarAcond);
    document.getElementById('btnGuardarEnsayo').addEventListener('click', guardarEnsayo);
    document.getElementById('btnGuardarInforme').addEventListener('click', guardarEntregaInforme);
    document.getElementById('btnGuardarCierre').addEventListener('click', guardarCierreFinal);
}

function cargarMuestraEnEtapa(id, stageKey) {
    const cfg = STAGE_CONFIG[stageKey];
    if (!cfg) return;
    activarTab(cfg.tabId, true);
    document.getElementById(cfg.inputId).value = extraerIdMuestra(id);
    buscarMuestraEtapa(stageKey);
}

async function buscarMuestraEtapa(stageKey, { preserveAlerts = false } = {}) {
    const cfg = STAGE_CONFIG[stageKey];
    const id  = extraerIdMuestra(document.getElementById(cfg.inputId).value);
    document.getElementById(cfg.inputId).value = id;
    if (!id) {
        mostrarAlerta(cfg.alertId, '⚠️ Ingrese el ID o escanee el QR.', 'danger');
        return;
    }

    if (!preserveAlerts) {
        stageSampleIds[stageKey] = null;
        document.getElementById(cfg.infoId).style.display = 'none';
        const inlineEl = document.getElementById(cfg.inlineAlertId);
        if (inlineEl) inlineEl.style.display = 'none';
    }

    try {
        const snap = await getDoc(doc(db, 'seguimiento_muestras', id));
        if (!snap.exists()) {
            stageSampleIds[stageKey] = null;
            document.getElementById(cfg.infoId).style.display = 'none';
            mostrarAlerta(cfg.alertId, '❌ No se encontró la muestra con ese ID.', 'danger');
            return;
        }
        const data    = snap.data();
        const muestra = { id, ...data };
        stageSampleIds[stageKey] = id;

        renderResumenCliente(cfg.clienteId, data, stageKey);
        if (stageKey === 'ensayo')  renderHistorialEnsayos(data);
        if (stageKey === 'informe') renderHistorialInforme(data);
        if (stageKey === 'cierre')  renderEstadoCierre(data);

        document.getElementById(cfg.infoId).style.display = 'block';
        actualizarFlujogramaActivo(muestra);
    } catch (err) {
        mostrarAlerta(cfg.alertId, '❌ Error al buscar: ' + err.message, 'danger');
    }
}

function renderResumenCliente(targetId, data, stageKey) {
    let extra = '';
    if (stageKey === 'acond' && data.acondicionamiento) {
        extra = `<br><span style="color:#217346; font-weight:600;">✅ Ya tiene entrada a acondicionamiento: ${esc(data.acondicionamiento.fecha)} — ${esc(data.acondicionamiento.analista)}</span>`;
    }
    document.getElementById(targetId).innerHTML = `
        <strong>Razón Social:</strong> ${esc(data.razonSocial)} &nbsp;|&nbsp;
        <strong>RUC:</strong> ${esc(data.ruc)}
        ${data.descripcion ? ` &nbsp;|&nbsp; <strong>Muestra:</strong> ${esc(data.descripcion)}` : ''}
        <br><span style="font-size:0.8rem; color:#555;">Registrado: ${esc(tsToStr(data.fechaCreacion))} por ${esc(data.creadoPor)}</span>
        ${extra}
    `;
}

// ── ETAPA 2: ACONDICIONAMIENTO ──────────────────────────────────
async function guardarAcond() {
    const id = stageSampleIds.acond || extraerIdMuestra(document.getElementById('idMuestraAcond').value);
    if (!id) {
        notificarEtapa('acond', '⚠️ Primero busque o escanee una muestra.', 'danger');
        return;
    }
    const analista = getNombreAnalista('analistaAcond');
    if (!analista.id || !analista.nombre) {
        notificarEtapa('acond', '⚠️ Seleccione un analista responsable (o elija "Otro analista" e ingrese el nombre).', 'danger');
        return;
    }

    const fecha = document.getElementById('fechaAcond').value || fechaHoraStr(new Date());
    const btn   = document.getElementById('btnGuardarAcond');
    btn.disabled = true;
    btn.textContent = '⏳ Guardando...';

    try {
        await updateDoc(doc(db, 'seguimiento_muestras', id), {
            acondicionamiento: {
                fecha,
                timestampMs:   Date.now(),
                analistaId:    analista.id,
                analista:      analista.nombre,
                registradoPor: currentUser?.email || currentUser?.uid || ''
            }
        });
        notificarEtapa('acond', '✅ Entrada a acondicionamiento registrada correctamente.', 'success');
        await buscarMuestraEtapa('acond', { preserveAlerts: true });
    } catch (err) {
        console.error('Error en guardarAcond:', err);
        notificarEtapa('acond', '❌ Error al registrar en Firestore: ' + err.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.textContent = '✅ Registrar Entrada a Acondicionamiento';
    }
}

// ── ETAPA 3: INICIO DE ENSAYO (REPETIBLE N VECES) ───────────────
function renderHistorialEnsayos(data) {
    const ensayos = Array.isArray(data.ensayos) ? data.ensayos : [];
    const histEl  = document.getElementById('historialEnsayos');
    if (ensayos.length === 0) {
        histEl.innerHTML = '<p style="color:#888; font-size:0.88rem;">Sin inicios de ensayo previos.</p>';
        return;
    }
    let html = `<p style="font-weight:600; color:#004a8f; margin:0 0 8px;">📋 Ensayos registrados (${ensayos.length}):</p>`;
    ensayos.forEach((en, i) => {
        html += `<div class="historial-item">
            <strong>Ensayo #${i + 1}</strong> — ${esc(en.fecha)}
            &nbsp;|&nbsp; Analista: <strong>${esc(en.analista)}</strong>
            ${en.observaciones ? ` &nbsp;|&nbsp; Obs: ${esc(en.observaciones)}` : ''}
        </div>`;
    });
    histEl.innerHTML = html;
}

async function guardarEnsayo() {
    const id = stageSampleIds.ensayo || extraerIdMuestra(document.getElementById('idMuestraEnsayo').value);
    if (!id) {
        notificarEtapa('ensayo', '⚠️ Primero busque o escanee una muestra.', 'danger');
        return;
    }
    const analista = getNombreAnalista('analistaEnsayo');
    if (!analista.id || !analista.nombre) {
        notificarEtapa('ensayo', '⚠️ Seleccione un analista responsable (o elija "Otro analista" e ingrese el nombre).', 'danger');
        return;
    }

    const fecha = document.getElementById('fechaEnsayo').value || fechaHoraStr(new Date());
    const obs   = document.getElementById('obsEnsayo').value.trim();
    const btn   = document.getElementById('btnGuardarEnsayo');
    btn.disabled = true;
    btn.textContent = '⏳ Guardando...';

    const nuevoEnsayo = {
        fecha,
        timestampMs:   Date.now(),
        analistaId:    analista.id,
        analista:      analista.nombre,
        observaciones: obs,
        registradoPor: currentUser?.email || currentUser?.uid || ''
    };

    try {
        await updateDoc(doc(db, 'seguimiento_muestras', id), {
            ensayos: arrayUnion(nuevoEnsayo)
        });
        notificarEtapa('ensayo', '✅ Inicio de ensayo registrado. Puede registrar otra repetición si es necesario.', 'success');
        document.getElementById('obsEnsayo').value = '';
        await buscarMuestraEtapa('ensayo', { preserveAlerts: true });
    } catch (err) {
        console.error('Error en guardarEnsayo:', err);
        notificarEtapa('ensayo', '❌ Error al registrar en Firestore: ' + err.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.textContent = '✅ Registrar Inicio de Ensayo';
    }
}

// ── ETAPA 4: FIN DE ENSAYO Y CÁLCULOS / INICIO INFORME FINAL ────
function renderHistorialInforme(data) {
    const entregas      = Array.isArray(data.entregasInforme) ? data.entregasInforme : [];
    const ultimaEntrega = obtenerUltimaEntrega(data);
    const resumenEl     = document.getElementById('resumenInicioInforme');
    const histEl        = document.getElementById('historialEntregasInforme');

    if (ultimaEntrega && ultimaEntrega.fecha) {
        resumenEl.innerHTML = `
            <div class="historial-item destacado">
                <strong>📌 Inicio de Elaboración del Informe Final (según último analista):</strong><br>
                📅 <strong>${esc(ultimaEntrega.fecha)}</strong> &nbsp;|&nbsp;
                Último analista en entregar: <strong>${esc(ultimaEntrega.analista)}</strong>
                (${entregas.length} entrega${entregas.length === 1 ? '' : 's'} registrada${entregas.length === 1 ? '' : 's'})
            </div>
        `;
    } else {
        resumenEl.innerHTML = `
            <div class="historial-item">
                ⏳ Aún no hay entregas de cálculos/ensayos terminados. Cada analista debe escanear el QR al finalizar; el último analista en entregar marcará el inicio del informe final.
            </div>
        `;
    }

    if (entregas.length === 0) {
        histEl.innerHTML = '';
        return;
    }

    let html = `<p style="font-weight:600; color:#004a8f; margin:0 0 8px;">👥 Entregas de analistas (${entregas.length}):</p>`;
    entregas.forEach((ent, i) => {
        const esUltimo = ultimaEntrega && ent.timestampMs === ultimaEntrega.timestampMs && ent.analistaId === ultimaEntrega.analistaId;
        html += `<div class="historial-item${esUltimo ? ' destacado' : ''}">
            <strong>Entrega #${i + 1}</strong> — ${esc(ent.fecha)}
            &nbsp;|&nbsp; Analista: <strong>${esc(ent.analista)}</strong>
            ${esUltimo ? ' &nbsp;<span class="badge badge-success">Último analista (Inicio Informe Final)</span>' : ''}
            ${ent.observaciones ? `<br><span style="color:#555;">Obs: ${esc(ent.observaciones)}</span>` : ''}
        </div>`;
    });
    histEl.innerHTML = html;
}

async function guardarEntregaInforme() {
    const id = stageSampleIds.informe || extraerIdMuestra(document.getElementById('idMuestraInforme').value);
    if (!id) {
        notificarEtapa('informe', '⚠️ Primero busque o escanee una muestra.', 'danger');
        return;
    }
    const analista = getNombreAnalista('analistaInforme');
    if (!analista.id || !analista.nombre) {
        notificarEtapa('informe', '⚠️ Seleccione el analista que está enviando (o elija "Otro analista" e ingrese el nombre).', 'danger');
        return;
    }

    const fecha       = document.getElementById('fechaInforme').value || fechaHoraStr(new Date());
    const obs         = document.getElementById('obsInforme').value.trim();
    const timestampMs = Date.now();
    const btn         = document.getElementById('btnGuardarInforme');
    btn.disabled = true;
    btn.textContent = '⏳ Guardando...';

    const userEmail = currentUser?.email || currentUser?.uid || '';
    const nuevaEntrega = {
        fecha,
        timestampMs,
        analistaId:    analista.id,
        analista:      analista.nombre,
        observaciones: obs,
        registradoPor: userEmail
    };

    try {
        const docRef = doc(db, 'seguimiento_muestras', id);
        const snap   = await getDoc(docRef);
        const prev   = snap.exists() && Array.isArray(snap.data().entregasInforme)
            ? snap.data().entregasInforme
            : [];
        const actualizadas = [...prev, nuevaEntrega];

        await updateDoc(docRef, {
            entregasInforme: actualizadas,
            inicioInformeFinal: {
                fecha,
                timestampMs,
                analistaId:    analista.id,
                analista:      analista.nombre,
                totalEntregas: actualizadas.length,
                registradoPor: userEmail
            }
        });
        notificarEtapa('informe', '✅ Entrega registrada. El inicio de elaboración del informe final se actualizó con este último envío.', 'success');
        document.getElementById('obsInforme').value = '';
        await buscarMuestraEtapa('informe', { preserveAlerts: true });
    } catch (err) {
        console.error('Error en guardarEntregaInforme:', err);
        notificarEtapa('informe', '❌ Error al registrar en Firestore: ' + err.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.textContent = '✅ Registrar Entrega de Analista (Actualizar Inicio de Informe Final)';
    }
}

// ── ETAPA 5: CONCLUSIÓN Y ENVÍO DE INFORME AL CLIENTE ───────────
function renderEstadoCierre(data) {
    const ultimaEntrega = obtenerUltimaEntrega(data);
    const cierre        = data.cierreFinal;
    const estadoEl      = document.getElementById('estadoCierreActual');

    let html = '';
    if (ultimaEntrega && ultimaEntrega.fecha) {
        html += `<div class="historial-item">
            📊 <strong>Inicio de elaboración de informe final:</strong> ${esc(ultimaEntrega.fecha)}
            (Último analista: <strong>${esc(ultimaEntrega.analista)}</strong>)
        </div>`;
    } else {
        html += `<div class="historial-item" style="border-left-color:#d35400; background:#fff8f0;">
            ⚠️ Aún no se ha registrado la etapa 4 (entrega de ensayos y cálculos para el informe final).
        </div>`;
    }

    if (cierre && cierre.confirmado) {
        html += `<div class="historial-item destacado">
            🏁 <strong>Ensayo concluido e informe enviado al cliente</strong><br>
            📅 Fecha y hora de envío: <strong>${esc(cierre.fecha)}</strong>
            ${cierre.responsable ? ` &nbsp;|&nbsp; Responsable: <strong>${esc(cierre.responsable)}</strong>` : ''}
            ${cierre.medioEnvio ? `<br>📨 Medio / Referencia: ${esc(cierre.medioEnvio)}` : ''}
            ${cierre.observaciones ? `<br>📝 Obs: ${esc(cierre.observaciones)}` : ''}
        </div>`;
    }

    estadoEl.innerHTML = html;
    document.getElementById('confirmEnvioCliente').checked = !!(cierre && cierre.confirmado);
}

async function guardarCierreFinal() {
    const id = stageSampleIds.cierre || extraerIdMuestra(document.getElementById('idMuestraCierre').value);
    if (!id) {
        notificarEtapa('cierre', '⚠️ Primero busque o escanee una muestra.', 'danger');
        return;
    }

    const confirmado = document.getElementById('confirmEnvioCliente').checked;
    if (!confirmado) {
        notificarEtapa('cierre', '⚠️ Marque la casilla de confirmación de envío del informe al cliente.', 'danger');
        return;
    }

    const analista   = getNombreAnalista('analistaCierre');
    const fecha      = document.getElementById('fechaCierre').value || fechaHoraStr(new Date());
    const medioEnvio = document.getElementById('medioEnvioCierre').value.trim();
    const obs        = document.getElementById('obsCierre').value.trim();
    const btn        = document.getElementById('btnGuardarCierre');

    btn.disabled = true;
    btn.textContent = '⏳ Guardando...';

    const userEmail = currentUser?.email || currentUser?.uid || '';

    try {
        await updateDoc(doc(db, 'seguimiento_muestras', id), {
            cierreFinal: {
                fecha,
                timestampMs:   Date.now(),
                responsableId: analista.id || null,
                responsable:   analista.id ? analista.nombre : userEmail,
                medioEnvio,
                observaciones: obs,
                confirmado:    true,
                registradoPor: userEmail
            }
        });
        notificarEtapa('cierre', '🏁 Ensayo concluido y envío del informe final al cliente confirmado.', 'success');
        document.getElementById('medioEnvioCierre').value = '';
        document.getElementById('obsCierre').value        = '';
        await buscarMuestraEtapa('cierre', { preserveAlerts: true });
    } catch (err) {
        console.error('Error en guardarCierreFinal:', err);
        notificarEtapa('cierre', '❌ Error al registrar en Firestore: ' + err.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.textContent = '🏁 Concluir Ensayo y Confirmar Envío al Cliente';
    }
}

// ════════════════════════════════════════════════════════════════
//  TAB 6 — LISTADO
// ════════════════════════════════════════════════════════════════
function iniciarTab6Listado() {
    document.getElementById('btnActualizarListado').addEventListener('click', cargarListado);
    document.getElementById('filtroBusqueda').addEventListener('input', filtrarTabla);
    document.getElementById('filtroEstado').addEventListener('change', filtrarTabla);
}

function obtenerEstadoMuestra(m) {
    const ensayos  = Array.isArray(m.ensayos) ? m.ensayos : [];
    const ultima   = obtenerUltimaEntrega(m);
    if (m.cierreFinal?.confirmado) return 'concluido';
    if (ultima?.fecha)             return 'informe';
    if (ensayos.length > 0)        return 'ensayo';
    if (m.acondicionamiento)       return 'acondicionamiento';
    return 'registrado';
}

async function cargarListado() {
    document.getElementById('loaderListado').style.display = 'block';
    document.getElementById('contenedorTabla').innerHTML   = '';
    try {
        const snap = await getDocs(query(collection(db, 'seguimiento_muestras'), orderBy('fechaCreacion', 'desc')));
        _todasMuestras = [];
        snap.forEach(d => _todasMuestras.push({ id: d.id, ...d.data() }));
        filtrarTabla();
    } catch (err) {
        document.getElementById('contenedorTabla').innerHTML = `<p style="color:red;">Error al cargar: ${esc(err.message)}</p>`;
    }
    document.getElementById('loaderListado').style.display = 'none';
}

function filtrarTabla() {
    const texto  = document.getElementById('filtroBusqueda').value.toLowerCase();
    const estado = document.getElementById('filtroEstado').value;
    const filtradas = _todasMuestras.filter(m => {
        const matchTexto = !texto
            || (m.razonSocial || '').toLowerCase().includes(texto)
            || (m.ruc || '').includes(texto)
            || (m.id || '').toLowerCase().includes(texto);
        const matchEstado = !estado || obtenerEstadoMuestra(m) === estado;
        return matchTexto && matchEstado;
    });
    renderTabla(filtradas);
}

function renderTabla(muestras) {
    if (!muestras.length) {
        document.getElementById('contenedorTabla').innerHTML = '<p style="color:#888; text-align:center; padding:20px;">No se encontraron muestras.</p>';
        return;
    }
    const badges = {
        concluido:         '<span class="badge badge-success">🏁 Concluido y Enviado</span>',
        informe:           '<span class="badge badge-warning">📊 Informe Final</span>',
        ensayo:            '<span class="badge badge-primary">🧪 En Ensayo</span>',
        acondicionamiento: '<span class="badge badge-primary">🏷️ En Acond.</span>',
        registrado:        '<span class="badge badge-secondary">📝 Registrado</span>'
    };

    let html = `
        <table class="tabla-muestras">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Razón Social</th>
                    <th>RUC</th>
                    <th>Registro</th>
                    <th>Acond.</th>
                    <th>Ensayos</th>
                    <th>Informe Final</th>
                    <th>Cierre</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
    `;
    muestras.forEach((m, i) => {
        const ensayos  = Array.isArray(m.ensayos) ? m.ensayos : [];
        const entregas = Array.isArray(m.entregasInforme) ? m.entregasInforme : [];
        const ultima   = obtenerUltimaEntrega(m);
        const estKey   = obtenerEstadoMuestra(m);
        html += `
            <tr>
                <td>${i + 1}</td>
                <td><strong>${esc(m.razonSocial || '—')}</strong></td>
                <td>${esc(m.ruc || '—')}</td>
                <td style="font-size:0.8rem;">${esc(tsToStr(m.fechaCreacion))}</td>
                <td>${m.acondicionamiento ? '✅' : '—'}</td>
                <td>${ensayos.length > 0 ? `<strong>${ensayos.length}</strong>` : '—'}</td>
                <td style="font-size:0.8rem;">${ultima?.fecha ? `✅ (${entregas.length || 1})` : '—'}</td>
                <td>${m.cierreFinal?.confirmado ? '🏁' : '—'}</td>
                <td>${badges[estKey]}</td>
                <td>
                    <div class="acciones-cell">
                        <button class="btn-ver" style="background:#5b2c6f;" onclick="verFlujogramaModal('${esc(m.id)}')">📊 Flujo / QR</button>
                        <button class="btn-ver" onclick="verMuestra('${esc(m.id)}', 'acond')">🏷️ 2</button>
                        <button class="btn-ver" style="background:#00695c;" onclick="verMuestra('${esc(m.id)}', 'ensayo')">🧪 3</button>
                        <button class="btn-ver" style="background:#d35400;" onclick="verMuestra('${esc(m.id)}', 'informe')">📊 4</button>
                        <button class="btn-ver" style="background:#217346;" onclick="verMuestra('${esc(m.id)}', 'cierre')">📨 5</button>
                    </div>
                </td>
            </tr>
        `;
    });
    html += '</tbody></table>';
    document.getElementById('contenedorTabla').innerHTML = html;
}

window.verMuestra = function (id, destino) {
    cargarMuestraEnEtapa(id, destino);
};

window.verFlujogramaModal = function (id) {
    abrirModalDetalle(id);
};

// ════════════════════════════════════════════════════════════════
//  MODAL DETALLE (FLUJOGRAMA + QR)
// ════════════════════════════════════════════════════════════════
function iniciarModal() {
    document.getElementById('btnCerrarModal').addEventListener('click', cerrarModal);
    document.getElementById('modalDetalle').addEventListener('click', e => {
        if (e.target.id === 'modalDetalle') cerrarModal();
    });
    document.getElementById('btnDescModalQR').addEventListener('click', () => {
        descargarQrDesdeContenedor('#modalQrImagen', modalMuestraId);
    });
}

async function abrirModalDetalle(id) {
    modalMuestraId = id;
    let muestra = _todasMuestras.find(m => m.id === id) || (muestraActiva?.id === id ? muestraActiva : null);
    if (!muestra) {
        try {
            const snap = await getDoc(doc(db, 'seguimiento_muestras', id));
            if (snap.exists()) muestra = { id, ...snap.data() };
        } catch (err) {
            console.error(err);
        }
    }
    if (!muestra) return;

    document.getElementById('modalTitulo').textContent =
        `Flujograma y QR — ${muestra.razonSocial || 'Muestra'} (${muestra.ruc || ''})`;
    renderFlujograma('modalFlujograma', muestra, '', true);
    const qrUrl = generarUrlQr(id);
    document.getElementById('modalQrImagen').innerHTML  = generarQrImgHtml(id);
    document.getElementById('modalQrIdTexto').textContent = id;
    const modalQrUrlEl = document.getElementById('modalQrUrlTexto');
    if (modalQrUrlEl) {
        modalQrUrlEl.href = qrUrl;
        modalQrUrlEl.textContent = qrUrl;
    }
    document.getElementById('modalDetalle').style.display = 'flex';
}

function cerrarModal() {
    document.getElementById('modalDetalle').style.display = 'none';
}

// ════════════════════════════════════════════════════════════════
//  ESCÁNER QR (html5-qrcode) — instancia única segura
// ════════════════════════════════════════════════════════════════
async function detenerScannerActivo() {
    if (!activeScanner) return;
    const { instance, wrapperId } = activeScanner;
    activeScanner = null;
    try {
        await instance.stop();
    } catch { /* ignorar si ya estaba detenido */ }
    const wrap = document.getElementById(wrapperId);
    if (wrap) wrap.style.display = 'none';
}

async function iniciarScanner(wrapperId, readerId, inputId, onSuccess) {
    await detenerScannerActivo();
    document.getElementById(wrapperId).style.display = 'block';

    const scanner = new Html5Qrcode(readerId);
    activeScanner = { instance: scanner, wrapperId };

    scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
            let id = decodedText.trim();
            try {
                const url = new URL(decodedText);
                id = url.searchParams.get('id') || id;
            } catch { /* no es URL */ }
            document.getElementById(inputId).value = id;
            await detenerScannerActivo();
            onSuccess();
        },
        () => {}
    ).catch(err => {
        console.warn('Cámara no disponible:', err);
        detenerScannerActivo();
    });
}


// ════════════════════════════════════════════════════════════════
//  TAB 7 — DASHBOARD INTERACTIVO DE TIEMPOS POR PROCESO
// ════════════════════════════════════════════════════════════════
let dashChartSolicitudes = null;
let dashChartPromedios   = null;
let _dashProcesados      = [];
let _dashFiltrados       = [];
let dashSelectedId       = null;
let dashSort             = { key: 't1', dir: 'desc' };

const DASH_PROCESOS = [
    { key: 'p1', label: 'Recepción → Acond.',   color: '#3498db' },
    { key: 'p2', label: 'En Acondicionamiento', color: '#8e44ad' },
    { key: 'p3', label: 'Ensayo y Cálculos',    color: '#e67e22' },
    { key: 'p4', label: 'Informe Final → Envío', color: '#217346' }
];

function iniciarDashboard() {
    document.getElementById('btnDashActualizar').addEventListener('click', cargarDashboard);
    document.getElementById('btnDashExportar').addEventListener('click', exportarDashboardExcel);

    ['dashFiltroTexto', 'dashFechaDesde', 'dashFechaHasta', 'dashFiltroEstado', 'dashFiltroAnalista', 'dashUnidad']
        .forEach(id => {
            const el = document.getElementById(id);
            const ev = id === 'dashFiltroTexto' ? 'input' : 'change';
            el.addEventListener(ev, aplicarFiltrosDashboard);
        });

    document.getElementById('btnDashVerFlujo').addEventListener('click', () => {
        if (dashSelectedId) abrirModalDetalle(dashSelectedId);
    });
}

async function cargarDashboard() {
    document.getElementById('loaderDashboard').style.display = 'block';
    try {
        const snap = await getDocs(query(collection(db, 'seguimiento_muestras'), orderBy('fechaCreacion', 'desc')));
        _todasMuestras = [];
        snap.forEach(d => _todasMuestras.push({ id: d.id, ...d.data() }));
        _dashProcesados = _todasMuestras.map(calcularTiemposSolicitud);
        aplicarFiltrosDashboard();
    } catch (err) {
        console.error('Error en dashboard:', err);
        document.getElementById('dashKpiGrid').innerHTML =
            `<div class="kpi-card"><div class="kpi-title">Error</div><div class="kpi-sub">${esc(err.message)}</div></div>`;
    }
    document.getElementById('loaderDashboard').style.display = 'none';
}

function parseFechaEs(str) {
    if (!str || typeof str !== 'string') return null;
    const clean = str.trim();
    // Formato dd/mm/yyyy hh:mm(:ss)? (a. m. / p. m. / am / pm)?
    const m = clean.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?)?/i
    );
    if (m) {
        const day   = parseInt(m[1], 10);
        const month = parseInt(m[2], 10) - 1;
        const year  = parseInt(m[3], 10);
        let hour    = m[4] ? parseInt(m[4], 10) : 0;
        const min   = m[5] ? parseInt(m[5], 10) : 0;
        const sec   = m[6] ? parseInt(m[6], 10) : 0;
        const ampm  = m[7] ? m[7].toLowerCase().replace(/[\s.]/g, '') : '';
        if (ampm === 'pm' && hour < 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        const dt = new Date(year, month, day, hour, min, sec);
        return isNaN(dt.getTime()) ? null : dt.getTime();
    }
    const parsed = Date.parse(clean);
    return isNaN(parsed) ? null : parsed;
}

function extractTimestampMs(obj) {
    if (!obj) return null;
    if (typeof obj.toMillis === 'function') return obj.toMillis();
    if (typeof obj.toDate === 'function') return obj.toDate().getTime();
    if (typeof obj === 'number') return obj;
    if (typeof obj === 'string') return parseFechaEs(obj);
    if (typeof obj.timestampMs === 'number') return obj.timestampMs;
    if (obj.fecha) return parseFechaEs(obj.fecha);
    return null;
}

function calcularTiemposSolicitud(m) {
    const ensayos       = Array.isArray(m.ensayos) ? m.ensayos : [];
    const entregas      = Array.isArray(m.entregasInforme) ? m.entregasInforme : [];
    const ultimaEntrega = obtenerUltimaEntrega(m);

    const t1      = extractTimestampMs(m.fechaCreacion);
    const t2      = extractTimestampMs(m.acondicionamiento);
    const t3First = ensayos.length > 0 ? extractTimestampMs(ensayos[0]) : null;
    const t3Last  = ensayos.length > 0 ? extractTimestampMs(ensayos[ensayos.length - 1]) : null;
    const t4      = extractTimestampMs(ultimaEntrega);
    const t5      = m.cierreFinal?.confirmado ? extractTimestampMs(m.cierreFinal) : null;

    const p1 = (t1 != null && t2 != null)      ? Math.max(0, t2 - t1)      : null;
    const p2 = (t2 != null && t3First != null) ? Math.max(0, t3First - t2) : null;
    const p3 = (t3First != null && t4 != null) ? Math.max(0, t4 - t3First) : null;
    const p4 = (t4 != null && t5 != null)      ? Math.max(0, t5 - t4)      : null;

    const esConcluido = !!(m.cierreFinal?.confirmado && t1 != null && t5 != null);
    const tiempoEtapasMs = [p1, p2, p3, p4].reduce((acc, v) => acc + (v || 0), 0);
    const tiempoTranscurridoMs = t1 != null ? Math.max(0, (esConcluido ? t5 : Date.now()) - t1) : null;

    const analistasSet = new Set();
    if (m.acondicionamiento?.analista) analistasSet.add(m.acondicionamiento.analista);
    ensayos.forEach(e => { if (e.analista) analistasSet.add(e.analista); });
    entregas.forEach(e => { if (e.analista) analistasSet.add(e.analista); });
    if (m.cierreFinal?.responsable) analistasSet.add(m.cierreFinal.responsable);

    return {
        ...m,
        t1, t2, t3First, t3Last, t4, t5,
        p1, p2, p3, p4,
        esConcluido,
        tiempoEtapasMs,
        tiempoTranscurridoMs,
        ultimaEntrega,
        analistasList: Array.from(analistasSet)
    };
}

function formatDuracion(ms) {
    if (ms == null || isNaN(ms)) return '—';
    const totalSec = Math.floor(ms / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const dias  = Math.floor(totalSec / 86400);
    const horas = Math.floor((totalSec % 86400) / 3600);
    const mins  = Math.floor((totalSec % 3600) / 60);
    const secs  = totalSec % 60;
    if (dias > 0)  return `${dias}d ${horas}h ${mins}m`;
    if (horas > 0) return `${horas}h ${mins}m`;
    return `${mins}m ${secs}s`;
}

function resolverUnidad(items, pref) {
    if (pref !== 'auto') {
        const map = {
            min: { key: 'min', factor: 60000,    label: 'min' },
            h:   { key: 'h',   factor: 3600000,  label: 'h' },
            d:   { key: 'd',   factor: 86400000, label: 'días' }
        };
        return map[pref] || map.h;
    }
    const maxMs = items.reduce((mx, it) => Math.max(mx, it.tiempoEtapasMs || 0), 0);
    if (maxMs >= 2 * 86400000) return { key: 'd',   factor: 86400000, label: 'días' };
    if (maxMs >= 2 * 3600000)  return { key: 'h',   factor: 3600000,  label: 'h' };
    return { key: 'min', factor: 60000, label: 'min' };
}

function toUnitVal(ms, factor) {
    if (ms == null) return 0;
    return Number((ms / factor).toFixed(2));
}

function aplicarFiltrosDashboard() {
    const texto    = document.getElementById('dashFiltroTexto').value.trim().toLowerCase();
    const desdeStr = document.getElementById('dashFechaDesde').value;
    const hastaStr = document.getElementById('dashFechaHasta').value;
    const estado   = document.getElementById('dashFiltroEstado').value;
    const analista = document.getElementById('dashFiltroAnalista').value;

    const desdeMs = desdeStr ? new Date(`${desdeStr}T00:00:00`).getTime() : null;
    const hastaMs = hastaStr ? new Date(`${hastaStr}T23:59:59`).getTime() : null;

    _dashFiltrados = _dashProcesados.filter(it => {
        if (texto) {
            const match = (it.razonSocial || '').toLowerCase().includes(texto)
                || (it.ruc || '').toLowerCase().includes(texto)
                || (it.id || '').toLowerCase().includes(texto);
            if (!match) return false;
        }
        if (desdeMs != null && (it.t1 == null || it.t1 < desdeMs)) return false;
        if (hastaMs != null && (it.t1 == null || it.t1 > hastaMs)) return false;
        if (estado === 'concluido' && !it.esConcluido) return false;
        if (estado === 'en_proceso' && it.esConcluido) return false;
        if (analista && !it.analistasList.includes(analista)) return false;
        return true;
    });

    if (!dashSelectedId || !_dashFiltrados.some(x => x.id === dashSelectedId)) {
        dashSelectedId = _dashFiltrados.length > 0 ? _dashFiltrados[0].id : null;
    }

    renderDashboard();
}

function promedioCampo(items, key) {
    const vals = items.map(it => it[key]).filter(v => v != null);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function renderDashboard() {
    const items = _dashFiltrados;
    const unit  = resolverUnidad(items, document.getElementById('dashUnidad').value);

    // 1. KPIs
    const concluidos = items.filter(it => it.esConcluido);
    const enProceso  = items.length - concluidos.length;
    const avgTotal   = promedioCampo(concluidos, 'tiempoTranscurridoMs');
    const minTotal   = concluidos.length ? Math.min(...concluidos.map(c => c.tiempoTranscurridoMs)) : null;
    const maxTotal   = concluidos.length ? Math.max(...concluidos.map(c => c.tiempoTranscurridoMs)) : null;

    const promediosEtapa = DASH_PROCESOS.map(p => ({
        ...p,
        avgMs: promedioCampo(items, p.key),
        count: items.filter(it => it[p.key] != null).length
    }));
    const cuelloBotella = promediosEtapa
        .filter(e => e.avgMs != null)
        .sort((a, b) => b.avgMs - a.avgMs)[0] || null;

    const promEnsayoInf = (promediosEtapa[2].avgMs != null || promediosEtapa[3].avgMs != null)
        ? ((promediosEtapa[2].avgMs || 0) + (promediosEtapa[3].avgMs || 0))
        : null;

    document.getElementById('dashKpiGrid').innerHTML = `
        <div class="kpi-card">
            <div class="kpi-title">Solicitudes Analizadas</div>
            <div class="kpi-value">${items.length}</div>
            <div class="kpi-sub">🏁 ${concluidos.length} concluidas &nbsp;|&nbsp; ⏳ ${enProceso} en curso</div>
        </div>
        <div class="kpi-card kpi-green">
            <div class="kpi-title">Tiempo Promedio Total</div>
            <div class="kpi-value">${formatDuracion(avgTotal)}</div>
            <div class="kpi-sub">${concluidos.length ? `Mín: ${formatDuracion(minTotal)} | Máx: ${formatDuracion(maxTotal)}` : 'Sin solicitudes concluidas'}</div>
        </div>
        <div class="kpi-card kpi-orange">
            <div class="kpi-title">Etapa de Mayor Duración</div>
            <div class="kpi-value">${cuelloBotella ? formatDuracion(cuelloBotella.avgMs) : '—'}</div>
            <div class="kpi-sub">${cuelloBotella ? cuelloBotella.label : 'Sin intervalos completos'}</div>
        </div>
        <div class="kpi-card kpi-purple">
            <div class="kpi-title">Prom. Acondicionamiento</div>
            <div class="kpi-value">${formatDuracion(promediosEtapa[1].avgMs)}</div>
            <div class="kpi-sub">Basado en ${promediosEtapa[1].count} muestra(s)</div>
        </div>
        <div class="kpi-card kpi-blue">
            <div class="kpi-title">Prom. Ensayo + Informe</div>
            <div class="kpi-value">${formatDuracion(promEnsayoInf)}</div>
            <div class="kpi-sub">Ensayo: ${formatDuracion(promediosEtapa[2].avgMs)} | Inf.: ${formatDuracion(promediosEtapa[3].avgMs)}</div>
        </div>
    `;

    // 2. Gráfico Apilado por Solicitud
    renderDashCharts(items, promediosEtapa, unit);

    // 3. Detalle seleccionado
    renderDashDetalle();

    // 4. Tabla ordenable
    renderDashTabla(items);
}

function renderDashCharts(items, promediosEtapa, unit) {
    if (dashChartSolicitudes) { dashChartSolicitudes.destroy(); dashChartSolicitudes = null; }
    if (dashChartPromedios)   { dashChartPromedios.destroy();   dashChartPromedios   = null; }

    const barWrap = document.getElementById('dashBarWrap');
    const dynamicH = Math.max(300, Math.min(900, items.length * 42 + 70));
    barWrap.style.height = `${dynamicH}px`;

    const labels = items.map(it => {
        const nom = (it.razonSocial || 'Sin cliente').slice(0, 24);
        return `${nom} (${it.ruc || '—'})`;
    });

    const datasets = DASH_PROCESOS.map(proc => ({
        label:           proc.label,
        backgroundColor: proc.color,
        borderRadius:    3,
        data:            items.map(it => toUnitVal(it[proc.key], unit.factor))
    }));

    const ctx1 = document.getElementById('dashChartSolicitudes').getContext('2d');
    dashChartSolicitudes = new Chart(ctx1, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            onClick: (_evt, elements) => {
                if (elements && elements.length > 0) {
                    const idx = elements[0].index;
                    const sel = _dashFiltrados[idx];
                    if (sel) {
                        dashSelectedId = sel.id;
                        renderDashDetalle();
                        renderDashTabla(_dashFiltrados);
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const item = _dashFiltrados[ctx.dataIndex];
                            const proc = DASH_PROCESOS[ctx.datasetIndex];
                            const ms   = item ? item[proc.key] : null;
                            return ` ${proc.label}: ${formatDuracion(ms)} (${ctx.parsed.x} ${unit.label})`;
                        },
                        footer: (tipItems) => {
                            if (!tipItems.length) return '';
                            const item = _dashFiltrados[tipItems[0].dataIndex];
                            return item
                                ? `Total acumulado: ${formatDuracion(item.tiempoEtapasMs)}\nClic para ver detalle`
                                : '';
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: `Duración (${unit.label})` }
                },
                y: {
                    stacked: true,
                    ticks: { autoSkip: false }
                }
            }
        }
    });

    const ctx2 = document.getElementById('dashChartPromedios').getContext('2d');
    dashChartPromedios = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: promediosEtapa.map(p => p.label),
            datasets: [{
                label: `Promedio (${unit.label})`,
                data:  promediosEtapa.map(p => toUnitVal(p.avgMs, unit.factor)),
                backgroundColor: promediosEtapa.map(p => p.color),
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const p = promediosEtapa[ctx.dataIndex];
                            return ` Promedio: ${formatDuracion(p.avgMs)} (${p.count} reg.)`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: `Duración promedio (${unit.label})` }
                }
            }
        }
    });
}

function renderDashDetalle() {
    const card = document.getElementById('dashDetalleCard');
    const item = _dashFiltrados.find(x => x.id === dashSelectedId);
    if (!item) {
        card.style.display = 'none';
        return;
    }
    card.style.display = 'block';
    document.getElementById('dashDetalleTitulo').textContent =
        `${item.razonSocial || '—'} (RUC: ${item.ruc || '—'})`;

    const ensayos  = Array.isArray(item.ensayos) ? item.ensayos : [];
    const entregas = Array.isArray(item.entregasInforme) ? item.entregasInforme : [];
    const baseMs   = Math.max(item.tiempoEtapasMs || 0, 1);

    const tramos = [
        {
            titulo: '1 → 2. Recepción hasta Entrada a Acondicionamiento',
            color:  '#3498db',
            ms:     item.p1,
            inicio: item.t1 ? fechaHoraStr(new Date(item.t1)) : '—',
            fin:    item.acondicionamiento?.fecha || 'Pendiente',
            meta:   item.acondicionamiento?.analista
                ? `Analista acondicionamiento: ${item.acondicionamiento.analista}`
                : 'Aún no ingresa a sala de acondicionamiento'
        },
        {
            titulo: '2 → 3. Permanencia en Sala de Acondicionamiento',
            color:  '#8e44ad',
            ms:     item.p2,
            inicio: item.acondicionamiento?.fecha || '—',
            fin:    ensayos.length ? ensayos[0].fecha : 'Pendiente',
            meta:   ensayos.length
                ? `1er inicio de ensayo por ${ensayos[0].analista} (Total repeticiones/inicios: ${ensayos.length})`
                : 'Aún no inicia el ensayo'
        },
        {
            titulo: '3 → 4. Ejecución de Ensayo y Cálculos (hasta último analista)',
            color:  '#e67e22',
            ms:     item.p3,
            inicio: ensayos.length ? ensayos[0].fecha : '—',
            fin:    item.ultimaEntrega?.fecha || 'Pendiente',
            meta:   entregas.length
                ? `Entregas recibidas: ${entregas.length} | Último analista: ${item.ultimaEntrega?.analista || '—'}`
                : 'Esperando entrega de cálculos para iniciar informe final'
        },
        {
            titulo: '4 → 5. Elaboración de Informe Final y Envío al Cliente',
            color:  '#217346',
            ms:     item.p4,
            inicio: item.ultimaEntrega?.fecha || '—',
            fin:    item.cierreFinal?.confirmado ? item.cierreFinal.fecha : 'Pendiente',
            meta:   item.cierreFinal?.confirmado
                ? `Enviado por ${item.cierreFinal.responsable || '—'}${item.cierreFinal.medioEnvio ? ` (${item.cierreFinal.medioEnvio})` : ''}`
                : 'Informe final aún no concluido/enviado'
        }
    ];

    let html = `
        <div class="historial-item${item.esConcluido ? ' destacado' : ''}" style="margin-bottom:16px;">
            <strong>ID Muestra:</strong> <code>${esc(item.id)}</code> &nbsp;|&nbsp;
            <strong>Estado:</strong> ${item.esConcluido ? '🏁 Concluido y enviado' : '⏳ En proceso'} &nbsp;|&nbsp;
            <strong>Tiempo en etapas medidas:</strong> ${formatDuracion(item.tiempoEtapasMs)} &nbsp;|&nbsp;
            <strong>Tiempo total desde recepción:</strong> ${formatDuracion(item.tiempoTranscurridoMs)}
            ${item.descripcion ? `<br><strong>Descripción:</strong> ${esc(item.descripcion)}` : ''}
        </div>
        <div class="timeline-list">
    `;

    tramos.forEach(tr => {
        const pct = tr.ms != null && item.tiempoEtapasMs > 0
            ? Math.min(100, Math.round((tr.ms / baseMs) * 100))
            : 0;
        html += `
            <div class="timeline-item">
                <div class="timeline-item-head">
                    <strong>${esc(tr.titulo)}</strong>
                    <span>
                        <strong style="color:${tr.color};">${formatDuracion(tr.ms)}</strong>
                        ${tr.ms != null ? `<span style="color:#777; font-size:0.8rem;"> (${pct}%)</span>` : ''}
                    </span>
                </div>
                <div class="timeline-bar-track">
                    <div class="timeline-bar-fill" style="width:${pct}%; background:${tr.color};"></div>
                </div>
                <div class="timeline-meta">
                    🕒 Inicio: <strong>${esc(tr.inicio)}</strong> &nbsp;➔&nbsp; Fin: <strong>${esc(tr.fin)}</strong><br>
                    👤 ${esc(tr.meta)}
                </div>
            </div>
        `;
    });

    html += '</div>';
    document.getElementById('dashDetalleContenido').innerHTML = html;
}

function ordenarDashItems(items) {
    const { key, dir } = dashSort;
    const mult = dir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
        if (key === 'razonSocial') {
            return (a.razonSocial || '').localeCompare(b.razonSocial || '') * mult;
        }
        const va = a[key];
        const vb = b[key];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return (va - vb) * mult;
    });
}

function renderDashTabla(items) {
    if (!items.length) {
        document.getElementById('dashTablaContainer').innerHTML =
            '<p style="color:#888; text-align:center; padding:20px;">No hay solicitudes que coincidan con los filtros.</p>';
        return;
    }

    const ordenados = ordenarDashItems(items);
    const arrow = (k) => dashSort.key === k ? (dashSort.dir === 'asc' ? ' ▲' : ' ▼') : '';

    let html = `
        <table class="tabla-muestras">
            <thead>
                <tr>
                    <th class="sortable-th" data-sort="razonSocial">Cliente / RUC${arrow('razonSocial')}</th>
                    <th class="sortable-th" data-sort="t1">Registro${arrow('t1')}</th>
                    <th class="sortable-th" data-sort="p1">1→2 Acond.${arrow('p1')}</th>
                    <th class="sortable-th" data-sort="p2">2→3 En Acond.${arrow('p2')}</th>
                    <th class="sortable-th" data-sort="p3">3→4 Ensayo${arrow('p3')}</th>
                    <th class="sortable-th" data-sort="p4">4→5 Informe${arrow('p4')}</th>
                    <th class="sortable-th" data-sort="tiempoEtapasMs">Total Etapas${arrow('tiempoEtapasMs')}</th>
                    <th>Estado</th>
                    <th>Detalle</th>
                </tr>
            </thead>
            <tbody>
    `;

    ordenados.forEach(it => {
        const selCls = it.id === dashSelectedId ? ' class="row-selected"' : '';
        html += `
            <tr${selCls} data-dash-id="${esc(it.id)}" style="cursor:pointer;">
                <td>
                    <strong>${esc(it.razonSocial || '—')}</strong><br>
                    <span style="font-size:0.78rem; color:#666;">RUC: ${esc(it.ruc || '—')}</span>
                </td>
                <td style="font-size:0.8rem;">${esc(tsToStr(it.fechaCreacion))}</td>
                <td>${formatDuracion(it.p1)}</td>
                <td>${formatDuracion(it.p2)}</td>
                <td>${formatDuracion(it.p3)}</td>
                <td>${formatDuracion(it.p4)}</td>
                <td><strong>${formatDuracion(it.tiempoEtapasMs)}</strong></td>
                <td>
                    ${it.esConcluido
                        ? '<span class="badge badge-success">🏁 Concluido</span>'
                        : '<span class="badge badge-primary">⏳ En proceso</span>'}
                </td>
                <td>
                    <button class="btn-ver" style="background:#5b2c6f;" data-flujo-id="${esc(it.id)}">📊 Flujo</button>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    const container = document.getElementById('dashTablaContainer');
    container.innerHTML = html;

    container.querySelectorAll('.sortable-th').forEach(th => {
        th.addEventListener('click', () => {
            const k = th.dataset.sort;
            if (dashSort.key === k) {
                dashSort.dir = dashSort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                dashSort = { key: k, dir: 'desc' };
            }
            renderDashTabla(_dashFiltrados);
        });
    });

    container.querySelectorAll('tr[data-dash-id]').forEach(tr => {
        tr.addEventListener('click', (e) => {
            const flujoBtn = e.target.closest('[data-flujo-id]');
            if (flujoBtn) {
                abrirModalDetalle(flujoBtn.dataset.flujoId);
                return;
            }
            dashSelectedId = tr.dataset.dashId;
            renderDashDetalle();
            renderDashTabla(_dashFiltrados);
        });
    });
}

function exportarDashboardExcel() {
    if (!_dashFiltrados.length) return;
    const filas = _dashFiltrados.map(it => ({
        'ID Muestra':                   it.id,
        'Razón Social':                 it.razonSocial || '',
        'RUC':                          it.ruc || '',
        'Descripción':                  it.descripcion || '',
        'Fecha Registro':               tsToStr(it.fechaCreacion),
        'Entrada Acondicionamiento':    it.acondicionamiento?.fecha || '',
        'Analista Acondicionamiento':   it.acondicionamiento?.analista || '',
        '1er Inicio de Ensayo':         (it.ensayos && it.ensayos[0]?.fecha) || '',
        'Cantidad Inicios Ensayo':    (it.ensayos && it.ensayos.length) || 0,
        'Inicio Informe Final (Últ.)':  it.ultimaEntrega?.fecha || '',
        'Último Analista Entrega':      it.ultimaEntrega?.analista || '',
        'Cierre y Envío al Cliente':    it.cierreFinal?.fecha || '',
        'Responsable Envío':            it.cierreFinal?.responsable || '',
        'T1->T2 Recepción a Acond.':    formatDuracion(it.p1),
        'T2->T3 En Acondicionamiento':  formatDuracion(it.p2),
        'T3->T4 Ensayo y Cálculos':     formatDuracion(it.p3),
        'T4->T5 Informe Final y Envío': formatDuracion(it.p4),
        'Tiempo Total Etapas':          formatDuracion(it.tiempoEtapasMs),
        'Tiempo Transcurrido Total':    formatDuracion(it.tiempoTranscurridoMs),
        'Estado':                       it.esConcluido ? 'Concluido' : 'En proceso'
    }));

    if (typeof window.XLSX !== 'undefined') {
        const ws = window.XLSX.utils.json_to_sheet(filas);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, 'Tiempos_Procesos');
        window.XLSX.writeFile(wb, `Dashboard_Tiempos_LabCTTC_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } else {
        alert('La librería Excel no cargó. Verifique su conexión a internet.');
    }
}
