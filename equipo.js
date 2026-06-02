import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, getDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBR88EcYJPL3xIdr5X_p8cx2TEjz7LuzpM",
    authDomain: "lab-cttc.firebaseapp.com",
    projectId: "lab-cttc",
    storageBucket: "lab-cttc.appspot.com",
    messagingSenderId: "588785890026",
    appId: "1:588785890026:web:27ec4ea43a8a749989dd93"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
window.graficosEquipos = {};
window.currentUserRole = 'visor';

onAuthStateChanged(auth, async (user) => {
    const authCheck = document.getElementById('auth-check');
    const appSection = document.getElementById('appSection');

    if (user) {
        try {
            const docSnap = await getDoc(doc(db, "analistas", user.uid));
            if (docSnap.exists() && docSnap.data().rol) {
                window.currentUserRole = docSnap.data().rol;
            }
        } catch (e) { /* default to visor */ }

        authCheck.style.display = 'none';
        appSection.style.display = 'block';

        const params = new URLSearchParams(window.location.search);
        const equipoId = params.get('id');

        if (equipoId) {
            await loadEquipoView(equipoId);
        } else {
            document.getElementById('equipoHeader').innerText = "Error";
            document.getElementById('equipoContent').innerHTML = `<p style="color: #c0392b;">No se especificó un ID de equipo.</p>`;
        }
    } else {
        authCheck.innerHTML = `
            <h2 style="color: #c0392b;">Acceso Denegado</h2>
            <p>Debe iniciar sesión para ver los detalles de un equipo.</p>
            <a href="index.html" class="btn-primary" style="text-decoration: none; margin-top: 20px;">Ir a la página de inicio de sesión</a>
        `;
    }
});

async function loadEquipoView(equipoId) {
    const ficha = await cargarFichaEquipo(equipoId);
    let equipoNombre = ficha?.marca && ficha?.modelo ? `${ficha.marca} ${ficha.modelo}` : equipoId.replace(/_/g, ' ').replace(/-/g, ' ');
    document.getElementById('equipoHeader').innerText = `Detalles de: ${equipoNombre}`;

    const equipoHTML = crearVistaEquipoHTML(equipoId, equipoNombre);
    document.getElementById('equipoContent').innerHTML = equipoHTML;

    if (ficha) {
        const bindData = (idSuffix, data) => ['marca', 'modelo', 'serie', 'ubicacion', 'rango', 'resolucion'].forEach(k => {
            const el = document.getElementById(`${idSuffix}-${k}`);
            if (data[k] && el) el.value = data[k];
        });
        bindData(equipoId, ficha);
    }
    
    adjuntarListenersParaEquipo(equipoId);
    
    await cargarVerificaciones(equipoId);
    llenarDesplegablesVerificacion(equipoId);
    await cargarAnalistasDropdown(equipoId);
    setFechaHoraActual(equipoId);
}

function crearVistaEquipoHTML(equipoId, equipoNombre) {
    const puedeEditar = window.currentUserRole === 'admin' || window.currentUserRole === 'analista';
    return `
        <h4 style="color: #004a8f; padding: 8px; background: #eef; border-radius: 4px; margin-top: 10px;">1. Ficha de equipo</h4>
        <div id="ficha-${equipoId}" style="padding: 15px; background: #fff; border: 1px solid #ddd; border-radius: 4px; margin-top: 5px;">
            <form id="form-ficha-${equipoId}" style="display: flex; flex-direction: column; gap: 15px;">
                <div style="display: flex; gap: 15px; flex-wrap: wrap;"><div style="flex: 1; min-width: 200px;"><label>Marca:</label><input type="text" id="${equipoId}-marca" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px;"></div><div style="flex: 1; min-width: 200px;"><label>Modelo:</label><input type="text" id="${equipoId}-modelo" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px;"></div></div>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;"><div style="flex: 1; min-width: 200px;"><label>N° Serie:</label><input type="text" id="${equipoId}-serie" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px;"></div><div style="flex: 1; min-width: 200px;"><label>Ubicación:</label><input type="text" id="${equipoId}-ubicacion" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px;"></div></div>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;"><div style="flex: 1; min-width: 200px;"><label>Rango:</label><input type="text" id="${equipoId}-rango" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px;"></div><div style="flex: 1; min-width: 200px;"><label>Resolución:</label><input type="text" id="${equipoId}-resolucion" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px;"></div></div>
                ${puedeEditar ? `<button type="button" id="btn-guardar-ficha-${equipoId}" class="btn-primary" style="align-self: flex-start; padding: 10px 20px; margin-top: 10px; cursor: pointer;">Guardar Ficha</button>` : ''}
            </form>
        </div>
        <h4 style="color: #004a8f; padding: 8px; background: #eef; border-radius: 4px; margin-top: 10px;">2. Registro de verificación</h4>
        <div id="verificacion-${equipoId}" style="padding: 15px; background: #fff; border: 1px solid #ddd; border-radius: 4px; margin-top: 5px;">
            ${puedeEditar ? `<form id="form-verificacion-${equipoId}" style="display: flex; flex-direction: column; gap: 15px;">
                <div style="display: flex; gap: 15px; flex-wrap: wrap;"><div style="flex: 1; min-width: 150px;"><label>Fecha:</label><input type="date" id="verif-fecha-${equipoId}" required style="width: 100%; padding: 8px; border: 1px solid #ccc; margin-top: 5px;"></div><div style="flex: 1; min-width: 100px;"><label>Hora:</label><input type="time" id="verif-hora-${equipoId}" required style="width: 100%; padding: 8px; border: 1px solid #ccc; margin-top: 5px;"></div><div style="flex: 1; min-width: 100px;"><label>T (°C):</label><select id="verif-temp-${equipoId}" required style="width: 100%; padding: 8px; border: 1px solid #ccc; margin-top: 5px; background: white;"></select></div><div style="flex: 1; min-width: 100px;"><label>H.R (%):</label><select id="verif-hr-${equipoId}" required style="width: 100%; padding: 8px; border: 1px solid #ccc; margin-top: 5px; background: white;"></select></div><div style="flex: 1; min-width: 150px;"><label>Responsable:</label><select id="verif-resp-${equipoId}" required style="width: 100%; padding: 8px; border: 1px solid #ccc; margin-top: 5px; background: white;"></select></div></div>
                <fieldset style="border: 1px solid #ccc; padding: 10px;"><legend>VERIFICACIÓN (1.0000 g) - EMP ± 0.001 g</legend><div style="display: flex; gap: 15px; flex-wrap: wrap;"><div style="flex: 1;"><label>P1:</label><input type="number" step="0.0001" class="verif-1g-${equipoId}" required style="width: 100%; padding: 8px;"></div><div style="flex: 1;"><label>P2:</label><input type="number" step="0.0001" class="verif-1g-${equipoId}" required style="width: 100%; padding: 8px;"></div><div style="flex: 1;"><label>P3:</label><input type="number" step="0.0001" class="verif-1g-${equipoId}" required style="width: 100%; padding: 8px;"></div><div style="flex: 1;"><label>Rango:</label><input type="text" id="verif-1g-rango-${equipoId}" readonly style="width: 100%; padding: 8px; background: #eef;"></div><div style="flex: 2;"><label>Obs.:</label><input type="text" id="verif-1g-obs-${equipoId}" value="----" style="width: 100%; padding: 8px;"></div></div></fieldset>
                <fieldset style="border: 1px solid #ccc; padding: 10px;"><legend>VERIFICACIÓN (10.0000 g) - EMP ± 0.001 g</legend><div style="display: flex; gap: 15px; flex-wrap: wrap;"><div style="flex: 1;"><label>P1:</label><input type="number" step="0.0001" class="verif-10g-${equipoId}" required style="width: 100%; padding: 8px;"></div><div style="flex: 1;"><label>P2:</label><input type="number" step="0.0001" class="verif-10g-${equipoId}" required style="width: 100%; padding: 8px;"></div><div style="flex: 1;"><label>P3:</label><input type="number" step="0.0001" class="verif-10g-${equipoId}" required style="width: 100%; padding: 8px;"></div><div style="flex: 1;"><label>Rango:</label><input type="text" id="verif-10g-rango-${equipoId}" readonly style="width: 100%; padding: 8px; background: #eef;"></div><div style="flex: 2;"><label>Obs.:</label><input type="text" id="verif-10g-obs-${equipoId}" value="----" style="width: 100%; padding: 8px;"></div></div></fieldset>
                <fieldset style="border: 1px solid #ccc; padding: 10px;"><legend>VERIFICACIÓN (100.0000 g) - EMP ± 0.002 g</legend><div style="display: flex; gap: 15px; flex-wrap: wrap;"><div style="flex: 1;"><label>P1:</label><input type="number" step="0.0001" class="verif-100g-${equipoId}" required style="width: 100%; padding: 8px;"></div><div style="flex: 1;"><label>P2:</label><input type="number" step="0.0001" class="verif-100g-${equipoId}" required style="width: 100%; padding: 8px;"></div><div style="flex: 1;"><label>P3:</label><input type="number" step="0.0001" class="verif-100g-${equipoId}" required style="width: 100%; padding: 8px;"></div><div style="flex: 1;"><label>Rango:</label><input type="text" id="verif-100g-rango-${equipoId}" readonly style="width: 100%; padding: 8px; background: #eef;"></div><div style="flex: 2;"><label>Obs.:</label><input type="text" id="verif-100g-obs-${equipoId}" value="----" style="width: 100%; padding: 8px;"></div></div></fieldset>
                <button type="submit" class="btn-primary" style="align-self: flex-start; padding: 10px 20px; margin-top: 10px; cursor: pointer;">Añadir Registro</button>
            </form>` : ''}
            <h5 style="margin-top: 25px;">Historial de Verificaciones</h5>
            <div style="overflow-x: auto;"><table style="width: 100%; font-size: 0.8em; text-align: center;" border="1"><thead style="background: #f3f3f3;"><tr><th rowspan="2">FECHA</th><th colspan="3">AUTOCALIBRACIÓN</th><th colspan="5">VERIFICACIÓN (1g)</th><th colspan="5">VERIFICACIÓN (10g)</th><th colspan="5">VERIFICACIÓN (100g)</th><th rowspan="2">RESPONSABLE</th><th rowspan="2" class="no-export">ACCIONES</th></tr><tr><th>HORA</th><th>T(°C)</th><th>H.R(%)</th><th>P1</th><th>P2</th><th>P3</th><th>Rango</th><th>Obs</th><th>P1</th><th>P2</th><th>P3</th><th>Rango</th><th>Obs</th><th>P1</th><th>P2</th><th>P3</th><th>Rango</th><th>Obs</th></tr></thead><tbody id="historial-verificaciones-${equipoId}"><tr><td colspan="21">Aún no hay registros.</td></tr></tbody></table></div>
            <h5 style="margin-top: 25px;">Tendencias de Verificaciones</h5>
            <div><canvas id="grafico-tendencia-${equipoId}" height="80"></canvas></div>
        </div>
        <h4 style="color: #004a8f; padding: 8px; background: #eef; border-radius: 4px; margin-top: 10px;">3. Manual de equipo</h4><div id="manual-${equipoId}" style="padding: 15px; background: #fff; border: 1px solid #ddd; border-radius: 4px; margin-top: 5px;"><p>Cargando...</p></div>
        <h4 style="color: #004a8f; padding: 8px; background: #eef; border-radius: 4px; margin-top: 10px;">4. Certificado de calibración</h4><div id="certificado-${equipoId}" style="padding: 15px; background: #fff; border: 1px solid #ddd; border-radius: 4px; margin-top: 5px;"><p>Cargando...</p></div>
        <h4 style="color: #004a8f; padding: 8px; background: #eef; border-radius: 4px; margin-top: 10px;">5. Procedimiento para el equipo</h4><div id="procedimiento-${equipoId}" style="padding: 15px; background: #fff; border: 1px solid #ddd; border-radius: 4px; margin-top: 5px;"><p>Cargando...</p></div>
    `;
}

function adjuntarListenersParaEquipo(equipoId) {
    if (window.currentUserRole !== 'admin' && window.currentUserRole !== 'analista') {
        document.querySelectorAll(`#form-ficha-${equipoId} input, #form-ficha-${equipoId} button`).forEach(el => el.disabled = true);
        return;
    }

    document.getElementById(`btn-guardar-ficha-${equipoId}`)?.addEventListener('click', async () => {
        const data = {
            marca: document.getElementById(`${equipoId}-marca`)?.value || '',
            modelo: document.getElementById(`${equipoId}-modelo`)?.value || '',
            serie: document.getElementById(`${equipoId}-serie`)?.value || '',
            ubicacion: document.getElementById(`${equipoId}-ubicacion`)?.value || '',
            rango: document.getElementById(`${equipoId}-rango`)?.value || '',
            resolucion: document.getElementById(`${equipoId}-resolucion`)?.value || '',
            fechaActualizacion: new Date().toISOString()
        };
        await guardarFichaEquipo(equipoId, data);
    });

    document.getElementById(`form-verificacion-${equipoId}`)?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            fecha: document.getElementById(`verif-fecha-${equipoId}`).value, hora: document.getElementById(`verif-hora-${equipoId}`).value,
            temp: document.getElementById(`verif-temp-${equipoId}`).value, hr: document.getElementById(`verif-hr-${equipoId}`).value,
            responsable: document.getElementById(`verif-resp-${equipoId}`).value,
            v1g_p1: document.querySelector(`.verif-1g-${equipoId}:nth-child(1) input`)?.value, v1g_p2: document.querySelector(`.verif-1g-${equipoId}:nth-child(2) input`)?.value, v1g_p3: document.querySelector(`.verif-1g-${equipoId}:nth-child(3) input`)?.value,
            v1g_rango: document.getElementById(`verif-1g-rango-${equipoId}`).value, v1g_obs: document.getElementById(`verif-1g-obs-${equipoId}`).value,
            v10g_p1: document.querySelector(`.verif-10g-${equipoId}:nth-child(1) input`)?.value, v10g_p2: document.querySelector(`.verif-10g-${equipoId}:nth-child(2) input`)?.value, v10g_p3: document.querySelector(`.verif-10g-${equipoId}:nth-child(3) input`)?.value,
            v10g_rango: document.getElementById(`verif-10g-rango-${equipoId}`).value, v10g_obs: document.getElementById(`verif-10g-obs-${equipoId}`).value,
            v100g_p1: document.querySelector(`.verif-100g-${equipoId}:nth-child(1) input`)?.value, v100g_p2: document.querySelector(`.verif-100g-${equipoId}:nth-child(2) input`)?.value, v100g_p3: document.querySelector(`.verif-100g-${equipoId}:nth-child(3) input`)?.value,
            v100g_rango: document.getElementById(`verif-100g-rango-${equipoId}`).value, v100g_obs: document.getElementById(`verif-100g-obs-${equipoId}`).value,
            createdAt: new Date().toISOString()
        };

        try {
            await addDoc(collection(db, `equipos/${equipoId}/verificaciones`), data);
            e.target.reset();
            setFechaHoraActual(equipoId);
            [`verif-1g-rango-${equipoId}`, `verif-10g-rango-${equipoId}`, `verif-100g-rango-${equipoId}`, `verif-1g-obs-${equipoId}`, `verif-10g-obs-${equipoId}`, `verif-100g-obs-${equipoId}`].forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.value = id.includes('obs') ? '----' : ''; el.style.color = ''; el.style.fontWeight = ''; }
            });
            cargarVerificaciones(equipoId);
            alert("Registro de verificación añadido correctamente.");
        } catch (error) {
            console.error("Error al guardar verificación: ", error);
            alert("Error al guardar: " + error.message);
        }
    });

    document.querySelectorAll(`.verif-1g-${equipoId}`).forEach(inp => inp.addEventListener('input', () => calcularRangoVerificacion(`verif-1g-${equipoId}`, `verif-1g-rango-${equipoId}`, 1.0000, 0.001, `verif-1g-obs-${equipoId}`)));
    document.querySelectorAll(`.verif-10g-${equipoId}`).forEach(inp => inp.addEventListener('input', () => calcularRangoVerificacion(`verif-10g-${equipoId}`, `verif-10g-rango-${equipoId}`, 10.0000, 0.001, `verif-10g-obs-${equipoId}`)));
    document.querySelectorAll(`.verif-100g-${equipoId}`).forEach(inp => inp.addEventListener('input', () => calcularRangoVerificacion(`verif-100g-${equipoId}`, `verif-100g-rango-${equipoId}`, 100.0000, 0.002, `verif-100g-obs-${equipoId}`)));
}

async function guardarFichaEquipo(equipoId, data) {
    try {
        await setDoc(doc(db, "equipos", equipoId), data, { merge: true });
        alert("Ficha de equipo guardada exitosamente.");
    } catch (error) {
        console.error("Error al guardar ficha: ", error);
        alert("Error al guardar la ficha: " + error.message);
    }
}

async function cargarFichaEquipo(equipoId) {
    try {
        const docSnap = await getDoc(doc(db, "equipos", equipoId));
        return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
        console.error("Error al cargar ficha: ", error);
        return null;
    }
}

function setFechaHoraActual(equipoId) {
    const now = new Date();
    const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const localTime = now.toTimeString().substring(0, 5);
    if(document.getElementById(`verif-fecha-${equipoId}`)) document.getElementById(`verif-fecha-${equipoId}`).value = localDate;
    if(document.getElementById(`verif-hora-${equipoId}`)) document.getElementById(`verif-hora-${equipoId}`).value = localTime;
}

async function cargarAnalistasDropdown(equipoId) {
    const selectResp = document.getElementById(`verif-resp-${equipoId}`);
    if (!selectResp) return;
    try {
        const snapshot = await getDocs(collection(db, "analistas"));
        selectResp.innerHTML = '<option value="" disabled selected>Seleccione responsable...</option>';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.rol === 'analista' || data.rol === 'admin') {
                const option = document.createElement('option');
                option.value = data.nombre;
                option.textContent = data.nombre;
                selectResp.appendChild(option);
            }
        });
    } catch (error) {
        console.error("Error al cargar analistas: ", error);
    }
}

function llenarDesplegablesVerificacion(equipoId) {
    const selTemp = document.getElementById(`verif-temp-${equipoId}`);
    const selHr = document.getElementById(`verif-hr-${equipoId}`);
    if (selTemp) { selTemp.innerHTML = '<option value="" disabled selected>Seleccione...</option>'; for(let i = 180; i <= 230; i++) selTemp.innerHTML += `<option value="${(i / 10).toFixed(2)}">${(i / 10).toFixed(2)}</option>`; }
    if (selHr) { selHr.innerHTML = '<option value="" disabled selected>Seleccione...</option>'; for(let i = 600; i <= 700; i++) selHr.innerHTML += `<option value="${(i / 10).toFixed(2)}">${(i / 10).toFixed(2)}</option>`; }
}

function calcularRangoVerificacion(claseInputs, idOutput, nominal, emp, idObs) {
    const inputs = document.querySelectorAll('.' + claseInputs);
    let max = -Infinity, min = Infinity, tieneValor = false, errorExcedido = false;
    inputs.forEach(inp => {
        if (inp.value !== '') {
            const val = parseFloat(inp.value);
            if (!isNaN(val)) {
                if (val > max) max = val;
                if (val < min) min = val;
                if (Math.abs(val - nominal) > emp) errorExcedido = true;
                tieneValor = true;
            }
        }
    });
    const output = document.getElementById(idOutput);
    const obs = document.getElementById(idObs);
    if (tieneValor) {
        const rango = (max - min);
        output.value = rango.toFixed(4);
        if (rango > emp || errorExcedido) {
            output.style.color = '#c0392b'; output.style.fontWeight = 'bold';
            if (obs) { obs.value = 'No Conforme'; obs.style.color = '#c0392b'; obs.style.fontWeight = 'bold'; }
        } else {
            output.style.color = '#217346'; output.style.fontWeight = 'bold';
            if (obs) { obs.value = 'Conforme'; obs.style.color = '#217346'; obs.style.fontWeight = 'bold'; }
        }
    } else {
        output.value = ''; output.style.color = '';
        if (obs) { obs.value = '----'; obs.style.color = ''; obs.style.fontWeight = ''; }
    }
}

async function cargarVerificaciones(equipoId) {
    const tbody = document.getElementById(`historial-verificaciones-${equipoId}`);
    if (!tbody) return;
    try {
        const qVerif = query(collection(db, `equipos/${equipoId}/verificaciones`), orderBy("fecha", "desc"), orderBy("hora", "desc"));
        const snapshot = await getDocs(qVerif);
        renderVerificacionesTable(equipoId, snapshot);
    } catch (error) {
        console.error(`Error al cargar verificaciones para ${equipoId}: `, error);
        tbody.innerHTML = `<tr><td colspan="21" style="padding: 8px; color: #c0392b;">Error al cargar registros</td></tr>`;
    }
}

function renderVerificacionesTable(equipoId, snapshot) {
    const tbody = document.getElementById(`historial-verificaciones-${equipoId}`);
    if (!tbody) return;
    tbody.innerHTML = '';
    const formatear = (val) => val != null && val !== '' ? parseFloat(val).toFixed(4) : '-';
    const docs = [];
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        docs.push(data);
        const colorObs = (obs) => obs === 'No Conforme' ? 'color: #c0392b; font-weight: bold;' : (obs === 'Conforme' ? 'color: #217346; font-weight: bold;' : '');
        const tr = document.createElement('tr');
        tr.innerHTML = `<td style="padding: 5px;">${data.fecha || '-'}</td><td style="padding: 5px;">${data.hora || '-'}</td><td style="padding: 5px;">${data.temp ? data.temp + ' ºC' : '-'}</td><td style="padding: 5px;">${data.hr ? data.hr + '%' : '-'}</td><td style="padding: 5px;">${formatear(data.v1g_p1)}</td><td style="padding: 5px;">${formatear(data.v1g_p2)}</td><td style="padding: 5px;">${formatear(data.v1g_p3)}</td><td style="padding: 5px;">${formatear(data.v1g_rango)}</td><td style="padding: 5px; ${colorObs(data.v1g_obs)}">${data.v1g_obs || '-'}</td><td style="padding: 5px;">${formatear(data.v10g_p1)}</td><td style="padding: 5px;">${formatear(data.v10g_p2)}</td><td style="padding: 5px;">${formatear(data.v10g_p3)}</td><td style="padding: 5px;">${formatear(data.v10g_rango)}</td><td style="padding: 5px; ${colorObs(data.v10g_obs)}">${data.v10g_obs || '-'}</td><td style="padding: 5px;">${formatear(data.v100g_p1)}</td><td style="padding: 5px;">${formatear(data.v100g_p2)}</td><td style="padding: 5px;">${formatear(data.v100g_p3)}</td><td style="padding: 5px;">${formatear(data.v100g_rango)}</td><td style="padding: 5px; ${colorObs(data.v100g_obs)}">${data.v100g_obs || '-'}</td><td style="padding: 5px;">${data.responsable || '-'}</td><td style="padding: 5px;" class="no-export">${window.currentUserRole === 'visor' ? '<span style="color:#888;">Lectura</span>' : `<button class="delete-btn" style="padding: 2px 5px; font-size: 0.8em; cursor: pointer; background: #c0392b; color: #fff; border: none; border-radius: 3px;" onclick="eliminarVerificacion('${equipoId}', '${docSnap.id}')">Eliminar</button>`}</td>`;
        tbody.appendChild(tr);
    });
    renderGraficoTendencia(equipoId, docs);
}

function renderGraficoTendencia(equipoId, docs) {
    const canvasId = `grafico-tendencia-${equipoId}`;
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;
    if (window.graficosEquipos[equipoId]) window.graficosEquipos[equipoId].destroy();
    
    const labels = [], err1g = [], err10g = [], err100g = [];
    const chronological = [...docs].reverse();
    
    chronological.forEach(data => {
        labels.push(`${data.fecha} ${data.hora}`);
        const calcError = (p1, p2, p3, nominal) => {
            if(!p1 || !p2 || !p3) return null;
            return ((parseFloat(p1) + parseFloat(p2) + parseFloat(p3)) / 3) - nominal;
        };
        err1g.push(calcError(data.v1g_p1, data.v1g_p2, data.v1g_p3, 1.0));
        err10g.push(calcError(data.v10g_p1, data.v10g_p2, data.v10g_p3, 10.0));
        err100g.push(calcError(data.v100g_p1, data.v100g_p2, data.v100g_p3, 100.0));
    });

    window.graficosEquipos[equipoId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Error 1g (EMP ±0.001)', data: err1g, borderColor: '#3498db', backgroundColor: '#3498db', tension: 0.3 },
                { label: 'Error 10g (EMP ±0.001)', data: err10g, borderColor: '#f1c40f', backgroundColor: '#f1c40f', tension: 0.3 },
                { label: 'Error 100g (EMP ±0.002)', data: err100g, borderColor: '#c0392b', backgroundColor: '#c0392b', tension: 0.3 }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: { title: { display: true, text: 'Error (g)' }, suggestedMin: -0.002, suggestedMax: 0.002 },
                x: { ticks: { maxRotation: 45, minRotation: 45 } }
            }
        }
    });
}

window.eliminarVerificacion = async function(equipoId, docId) {
    if(confirm("¿Desea borrar este registro de verificación?")) {
        try {
            await deleteDoc(doc(db, `equipos/${equipoId}/verificaciones`, docId));
            cargarVerificaciones(equipoId);
        } catch (e) {
            alert("Error al eliminar: " + e.message);
        }
    }
};