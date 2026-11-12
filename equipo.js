import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, getDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

window.toggleSection = function(contentId, headerElement) {
    const content = document.getElementById(contentId);
    const icon = headerElement.querySelector('span:last-child');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        if (icon) icon.innerText = '▼';
        if (contentId.startsWith('verificacion-') && typeof setFechaHoraActual === 'function') {
            const equipoId = contentId.replace('verificacion-', '');
            setFechaHoraActual(equipoId);
        }
    } else {
        content.style.display = 'none';
        if (icon) icon.innerText = '▶';
    }
};

onAuthStateChanged(auth, async (user) => {
    const authCheck = document.getElementById('auth-check');
    const appSection = document.getElementById('appSection');

    if (user) {
        try {
            const docSnap = await getDoc(doc(db, "analistas", user.uid));
            if (docSnap.exists() && docSnap.data().rol) {
                window.currentUserRole = docSnap.data().rol;
                document.getElementById('userDisplay').textContent = docSnap.data().nombre || user.email;
            } else {
                document.getElementById('userDisplay').textContent = user.email;
            }
        } catch (e) { 
            document.getElementById('userDisplay').textContent = user.email;
            /* default to visor */ }

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
        authCheck.style.display = 'block';
        appSection.style.display = 'none';
    }
});

async function loadEquipoView(equipoId) {
    const ficha = await cargarFichaEquipo(equipoId);
    let equipoNombre = ficha?.marca && ficha?.modelo ? `${ficha.marca} ${ficha.modelo}` : equipoId.replace(/_/g, ' ').replace(/-/g, ' ');
    document.getElementById('equipoHeader').innerText = `Detalles de: ${equipoNombre}`;

    const equipoHTML = crearVistaEquipoHTML(equipoId, equipoNombre);
    document.getElementById('equipoContent').innerHTML = equipoHTML;

    if (ficha) {
        const bindData = (idSuffix, data) => ['marca', 'modelo', 'serie', 'ubicacion', 'rango', 'resolucion', 'calibUltima', 'calibFrec', 'calibProxima', 'mantUltimo', 'mantFrec', 'mantProximo'].forEach(k => {
            let elId = `${idSuffix}-${k}`;
            if (k === 'calibUltima') elId = `${idSuffix}-calib-ultima`;
            if (k === 'calibFrec') elId = `${idSuffix}-calib-frec`;
            if (k === 'calibProxima') elId = `${idSuffix}-calib-proxima`;
            if (k === 'mantUltimo') elId = `${idSuffix}-mant-ultimo`;
            if (k === 'mantFrec') elId = `${idSuffix}-mant-frec`;
            if (k === 'mantProximo') elId = `${idSuffix}-mant-proximo`;
            
            const el = document.getElementById(elId);
            if (data[k] !== undefined && el) el.value = data[k];
        });
        bindData(equipoId, ficha);
        window.renderHistorialEventos(equipoId, ficha.historialEventos || []);
    }
    
    adjuntarListenersParaEquipo(equipoId);
    
    if (equipoId === 'ohaus_labt_157_23') {
        generateInspectionTable(`mantenimiento-${equipoId}`, equipoId);
        await cargarProgramaInspeccion(equipoId);
    }
    
    await cargarVerificaciones(equipoId);
    llenarDesplegablesVerificacion(equipoId);
    await cargarAnalistasDropdown(equipoId);
    setFechaHoraActual(equipoId);
}

function crearVistaEquipoHTML(equipoId, equipoNombre) {
    const puedeEditar = window.currentUserRole === 'admin' || window.currentUserRole === 'analista';

    const mantenimientoHTML = equipoId === 'ohaus_labt_157_23' ? `
        <h4 style="color: #004a8f; cursor: pointer; display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #eef; border-radius: 4px; margin-top: 10px;" onclick="window.toggleSection('mantenimiento-${equipoId}', this)">
            <span>1.1 Programa de Mantenimiento</span>
            <span style="font-size: 0.8em;">▶</span>
        </h4>
        <div id="mantenimiento-${equipoId}" style="display: none; padding: 15px; background: #fff; border: 1px solid #ddd; border-radius: 4px; margin-top: 5px;"></div>
    ` : '';

    return `
        <h4 style="color: #004a8f; cursor: pointer; display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #eef; border-radius: 4px; margin-top: 10px;" onclick="window.toggleSection('ficha-${equipoId}', this)">
            <span>1. Ficha de equipo</span>
            <span style="font-size: 0.8em;">▶</span>
        </h4>
        <div id="ficha-${equipoId}" style="display: none; padding: 15px; background: #fff; border: 1px solid #ddd; border-radius: 4px; margin-top: 5px;">
            <form id="form-ficha-${equipoId}" style="display: flex; flex-direction: column; gap: 15px;">
                <div style="display: flex; gap: 15px; flex-wrap: wrap;"><div style="flex: 1; min-width: 200px;"><label>Marca:</label><input type="text" id="${equipoId}-marca" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px;"></div><div style="flex: 1; min-width: 200px;"><label>Modelo:</label><input type="text" id="${equipoId}-modelo" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px;"></div></div>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;"><div style="flex: 1; min-width: 200px;"><label>N° Serie:</label><input type="text" id="${equipoId}-serie" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px;"></div><div style="flex: 1; min-width: 200px;"><label>Ubicación:</label><input type="text" id="${equipoId}-ubicacion" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px;"></div></div>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;"><div style="flex: 1; min-width: 200px;"><label>Rango:</label><input type="text" id="${equipoId}-rango" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px;"></div><div style="flex: 1; min-width: 200px;"><label>Resolución:</label><input type="text" id="${equipoId}-resolucion" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px;"></div></div>
                ${puedeEditar ? `<button type="button" id="btn-guardar-ficha-${equipoId}" class="btn-primary" style="align-self: flex-start; padding: 10px 20px; margin-top: 10px; cursor: pointer;">Guardar Ficha</button>` : ''}
            </form>
        </div>
        ${mantenimientoHTML}
        <h4 style="color: #004a8f; cursor: pointer; display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #eef; border-radius: 4px; margin-top: 10px;" onclick="window.toggleSection('verificacion-${equipoId}', this)">
            <span>2. Registro de verificación</span>
            <span style="font-size: 0.8em;">▶</span>
        </h4>
        <div id="verificacion-${equipoId}" style="display: none; padding: 15px; background: #fff; border: 1px solid #ddd; border-radius: 4px; margin-top: 5px;">
            ${puedeEditar ? `<form id="form-verificacion-${equipoId}" style="display: flex; flex-direction: column; gap: 15px;">
                <div style="display: flex; gap: 15px; flex-wrap: wrap;"><div style="flex: 1; min-width: 150px;"><label>Fecha:</label><input type="date" id="verif-fecha-${equipoId}" required style="width: 100%; padding: 8px; border: 1px solid #ccc; margin-top: 5px;"></div><div style="flex: 1; min-width: 100px;"><label>Hora:</label><input type="time" id="verif-hora-${equipoId}" required style="width: 100%; padding: 8px; border: 1px solid #ccc; margin-top: 5px;"></div><div style="flex: 1; min-width: 100px;"><label>T (°C):</label><select id="verif-temp-${equipoId}" required style="width: 100%; padding: 8px; border: 1px solid #ccc; margin-top: 5px; background: white;"></select></div><div style="flex: 1; min-width: 100px;"><label>H.R (%):</label><select id="verif-hr-${equipoId}" required style="width: 100%; padding: 8px; border: 1px solid #ccc; margin-top: 5px; background: white;"></select></div><div style="flex: 1; min-width: 150px;"><label>Responsable:</label><select id="verif-resp-${equipoId}" required style="width: 100%; padding: 8px; border: 1px solid #ccc; margin-top: 5px; background: white;"></select></div></div>
                <fieldset style="border: 1px solid #ccc; padding: 10px;"><legend>VERIFICACIÓN (1.0000 g) - EMP ± 0.001 g</legend><div style="display: flex; gap: 15px; flex-wrap: wrap;"><div style="flex: 1;"><label>P1:</label><input type="number" step="0.0001" id="verif-1g-p1-${equipoId}" class="verif-1g-${equipoId}" required style="width: 100%; padding: 8px;"></div><div style="flex: 1;"><label>P2:</label><input type="number" step="0.0001" id="verif-1g-p2-${equipoId}" class="verif-1g-${equipoId}" required style="width: 100%; padding: 8px;"></div><div style="flex: 1;"><label>P3:</label><input type="number" step="0.0001" id="verif-1g-p3-${equipoId}" class="verif-1g-${equipoId}" required style="width: 100%; padding: 8px;"></div><div style="flex: 1;"><label>Rango:</label><input type="text" id="verif-1g-rango-${equipoId}" readonly style="width: 100%; padding: 8px; background: #eef;"></div><div style="flex: 2;"><label>Obs.:</label><input type="text" id="verif-1g-obs-${equipoId}" value="----" style="width: 100%; padding: 8px;"></div></div></fieldset>
                <fieldset style="border: 1px solid #ccc; padding: 10px;"><legend>VERIFICACIÓN (10.0000 g) - EMP ± 0.001 g</legend><div style="display: flex; gap: 15px; flex-wrap: wrap;"><div style="flex: 1;"><label>P1:</label><input type="number" step="0.0001" id="verif-10g-p1-${equipoId}" class="verif-10g-${equipoId}" required style="width: 100%; padding: 8px;"></div><div style="flex: 1;"><label>P2:</label><input type="number" step="0.0001" id="verif-10g-p2-${equipoId}" class="verif-10g-${equipoId}" required style="width: 100%; padding: 8px;"></div><div style="flex: 1;"><label>P3:</label><input type="number" step="0.0001" id="verif-10g-p3-${equipoId}" class="verif-10g-${equipoId}" required style="width: 100%; padding: 8px;"></div><div style="flex: 1;"><label>Rango:</label><input type="text" id="verif-10g-rango-${equipoId}" readonly style="width: 100%; padding: 8px; background: #eef;"></div><div style="flex: 2;"><label>Obs.:</label><input type="text" id="verif-10g-obs-${equipoId}" value="----" style="width: 100%; padding: 8px;"></div></div></fieldset>
                <fieldset style="border: 1px solid #ccc; padding: 10px;"><legend>VERIFICACIÓN (100.0000 g) - EMP ± 0.002 g</legend><div style="display: flex; gap: 15px; flex-wrap: wrap;"><div style="flex: 1;"><label>P1:</label><input type="number" step="0.0001" id="verif-100g-p1-${equipoId}" class="verif-100g-${equipoId}" required style="width: 100%; padding: 8px;"></div><div style="flex: 1;"><label>P2:</label><input type="number" step="0.0001" id="verif-100g-p2-${equipoId}" class="verif-100g-${equipoId}" required style="width: 100%; padding: 8px;"></div><div style="flex: 1;"><label>P3:</label><input type="number" step="0.0001" id="verif-100g-p3-${equipoId}" class="verif-100g-${equipoId}" required style="width: 100%; padding: 8px;"></div><div style="flex: 1;"><label>Rango:</label><input type="text" id="verif-100g-rango-${equipoId}" readonly style="width: 100%; padding: 8px; background: #eef;"></div><div style="flex: 2;"><label>Obs.:</label><input type="text" id="verif-100g-obs-${equipoId}" value="----" style="width: 100%; padding: 8px;"></div></div></fieldset>
                <button type="submit" class="btn-primary" style="align-self: flex-start; padding: 10px 20px; margin-top: 10px; cursor: pointer;">Añadir Registro</button>
            </form>` : ''}
            <h5 style="margin-top: 25px;">Historial de Verificaciones</h5>
            <div style="overflow-x: auto;"><table style="width: 100%; font-size: 0.8em; text-align: center;" border="1"><thead style="background: #f3f3f3;"><tr><th rowspan="2">FECHA</th><th colspan="3">AUTOCALIBRACIÓN</th><th colspan="5">VERIFICACIÓN (1g)</th><th colspan="5">VERIFICACIÓN (10g)</th><th colspan="5">VERIFICACIÓN (100g)</th><th rowspan="2">RESPONSABLE</th><th rowspan="2" class="no-export">ACCIONES</th></tr><tr><th>HORA</th><th>T(°C)</th><th>H.R(%)</th><th>P1</th><th>P2</th><th>P3</th><th>Rango</th><th>Obs</th><th>P1</th><th>P2</th><th>P3</th><th>Rango</th><th>Obs</th><th>P1</th><th>P2</th><th>P3</th><th>Rango</th><th>Obs</th></tr></thead><tbody id="historial-verificaciones-${equipoId}"><tr><td colspan="21">Aún no hay registros.</td></tr></tbody></table></div>
            <h5 style="margin-top: 25px;">Tendencias de Verificaciones</h5>
            <div><canvas id="grafico-tendencia-${equipoId}" height="80"></canvas></div>
        </div>
        <h4 style="color: #004a8f; cursor: pointer; display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #eef; border-radius: 4px; margin-top: 10px;" onclick="window.toggleSection('manual-${equipoId}', this)">
            <span>3. Manual de equipo</span>
            <span style="font-size: 0.8em;">▶</span>
        </h4>
        <div id="manual-${equipoId}" style="display: none; padding: 15px; background: #fff; border: 1px solid #ddd; border-radius: 4px; margin-top: 5px;"><a href="https://drive.google.com/file/d/1ACJuAaBqiNLJi8JZLel762rrJ_zkh7MN/view?usp=sharing" target="_blank" class="btn-secondary" style="text-decoration: none;">📄 Ver Documento</a></div>
        <h4 style="color: #004a8f; cursor: pointer; display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #eef; border-radius: 4px; margin-top: 10px;" onclick="window.toggleSection('certificado-${equipoId}', this)">
            <span>4. Certificado de calibración</span>
            <span style="font-size: 0.8em;">▶</span>
        </h4>
        <div id="certificado-${equipoId}" style="display: none; padding: 15px; background: #fff; border: 1px solid #ddd; border-radius: 4px; margin-top: 5px;"><a href="https://drive.google.com/file/d/1aA9osU4hcFoxvxA8FL9WEDqYgeYYP0H-/view?usp=sharing" target="_blank" class="btn-secondary" style="text-decoration: none;">📄 Ver Documento</a></div>
        <h4 style="color: #004a8f; cursor: pointer; display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #eef; border-radius: 4px; margin-top: 10px;" onclick="window.toggleSection('procedimiento-${equipoId}', this)">
            <span>5. Procedimiento para el equipo</span>
            <span style="font-size: 0.8em;">▶</span>
        </h4>
        <div id="procedimiento-${equipoId}" style="display: none; padding: 15px; background: #fff; border: 1px solid #ddd; border-radius: 4px; margin-top: 5px;"><a href="https://drive.google.com/file/d/1QZnGJcdVCQjl8uMwnh7IwtS-WrMimF1r/view?usp=sharing" target="_blank" class="btn-secondary" style="text-decoration: none;">📄 Ver Documento</a></div>

    <h4 style="color: #004a8f; cursor: pointer; display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #eef; border-radius: 4px; margin-top: 10px;" onclick="window.toggleSection('periodicidad-${equipoId}', this)">
        <span>6. Cálculo de periodicidad</span>
        <span style="font-size: 0.8em;">▶</span>
    </h4>
    <div id="periodicidad-${equipoId}" style="display: none; padding: 15px; background: #fff; border: 1px solid #ddd; border-radius: 4px; margin-top: 5px;">
        <form id="form-periodicidad-${equipoId}" style="display: flex; flex-direction: column; gap: 15px;">
            <h5 style="margin: 0; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Calibración</h5>
            <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 150px;"><label>Última Calibración:</label><input type="date" id="${equipoId}-calib-ultima" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px;" ${puedeEditar ? '' : 'disabled'}></div>
                <div style="flex: 1; min-width: 150px;"><label>Frecuencia (meses):</label><input type="number" id="${equipoId}-calib-frec" min="1" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px;" ${puedeEditar ? '' : 'disabled'}></div>
                <div style="flex: 1; min-width: 150px;"><label>Próxima Calibración:</label><input type="date" id="${equipoId}-calib-proxima" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px; background: #eef;" disabled></div>
            </div>
            <h5 style="margin: 10px 0 0 0; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Mantenimiento</h5>
            <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 150px;"><label>Último Mantenimiento:</label><input type="date" id="${equipoId}-mant-ultimo" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px;" ${puedeEditar ? '' : 'disabled'}></div>
                <div style="flex: 1; min-width: 150px;"><label>Frecuencia (meses):</label><input type="number" id="${equipoId}-mant-frec" min="1" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px;" ${puedeEditar ? '' : 'disabled'}></div>
                <div style="flex: 1; min-width: 150px;"><label>Próximo Mantenimiento:</label><input type="date" id="${equipoId}-mant-proximo" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px; background: #eef;" disabled></div>
            </div>
            ${puedeEditar ? `<button type="button" id="btn-guardar-periodicidad-${equipoId}" class="btn-primary" style="align-self: flex-start; padding: 10px 20px; margin-top: 10px; cursor: pointer;">Guardar Periodicidad</button>` : ''}
        </form>
        <h5 style="margin-top: 25px; color: #333;">Historial de Eventos (Mantenimiento y Calibración)</h5>
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85em; text-align: left;" border="1">
                <thead style="background: #f3f3f3;"><tr><th style="padding: 5px;">Fecha Ejecución</th><th style="padding: 5px;">Tipo de Evento</th><th style="padding: 5px;">Fecha Programada (Original)</th><th style="padding: 5px;">Responsable</th></tr></thead>
                <tbody id="historial-eventos-${equipoId}"><tr><td colspan="4" style="padding: 5px; text-align: center;">No hay historial.</td></tr></tbody>
            </table>
        </div>
    </div>
    `;
}

window.renderHistorialEventos = function(equipoId, eventos) {
    const tbody = document.getElementById(`historial-eventos-${equipoId}`);
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!eventos || eventos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding: 5px; text-align: center;">No hay historial.</td></tr>';
        return;
    }
    const eventosOrdenados = [...eventos].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    eventosOrdenados.forEach(e => {
        tbody.innerHTML += `<tr>
            <td style="padding: 5px;">${e.fechaEjecucion}</td>
            <td style="padding: 5px;">${e.tipo}</td>
            <td style="padding: 5px;">${e.fechaProgramada || '-'}</td>
            <td style="padding: 5px;">${e.usuario || '-'}</td>
        </tr>`;
    });
};

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

    const calcularProxima = (ultimaId, frecId, proximaId) => {
        const ultima = document.getElementById(ultimaId)?.value;
        const frec = parseInt(document.getElementById(frecId)?.value);
        if (ultima && !isNaN(frec) && frec > 0) {
            const date = new Date(ultima);
            date.setMonth(date.getMonth() + frec);
            document.getElementById(proximaId).value = date.toISOString().split('T')[0];
        } else if (document.getElementById(proximaId)) document.getElementById(proximaId).value = '';
    };
    document.getElementById(`${equipoId}-calib-ultima`)?.addEventListener('input', () => calcularProxima(`${equipoId}-calib-ultima`, `${equipoId}-calib-frec`, `${equipoId}-calib-proxima`));
    document.getElementById(`${equipoId}-calib-frec`)?.addEventListener('input', () => calcularProxima(`${equipoId}-calib-ultima`, `${equipoId}-calib-frec`, `${equipoId}-calib-proxima`));
    document.getElementById(`${equipoId}-mant-ultimo`)?.addEventListener('input', () => calcularProxima(`${equipoId}-mant-ultimo`, `${equipoId}-mant-frec`, `${equipoId}-mant-proximo`));
    document.getElementById(`${equipoId}-mant-frec`)?.addEventListener('input', () => calcularProxima(`${equipoId}-mant-ultimo`, `${equipoId}-mant-frec`, `${equipoId}-mant-proximo`));

    document.getElementById(`btn-guardar-periodicidad-${equipoId}`)?.addEventListener('click', async () => {
        const data = {
            calibUltima: document.getElementById(`${equipoId}-calib-ultima`)?.value || '', calibFrec: document.getElementById(`${equipoId}-calib-frec`)?.value || '', calibProxima: document.getElementById(`${equipoId}-calib-proxima`)?.value || '',
            mantUltimo: document.getElementById(`${equipoId}-mant-ultimo`)?.value || '', mantFrec: document.getElementById(`${equipoId}-mant-frec`)?.value || '', mantProximo: document.getElementById(`${equipoId}-mant-proximo`)?.value || ''
        };
        await guardarFichaEquipo(equipoId, data);
    });

    document.getElementById(`form-verificacion-${equipoId}`)?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            fecha: document.getElementById(`verif-fecha-${equipoId}`).value, hora: document.getElementById(`verif-hora-${equipoId}`).value,
            temp: document.getElementById(`verif-temp-${equipoId}`).value, hr: document.getElementById(`verif-hr-${equipoId}`).value,
            responsable: document.getElementById(`verif-resp-${equipoId}`).value,
            v1g_p1: document.getElementById(`verif-1g-p1-${equipoId}`)?.value, v1g_p2: document.getElementById(`verif-1g-p2-${equipoId}`)?.value, v1g_p3: document.getElementById(`verif-1g-p3-${equipoId}`)?.value,
            v1g_rango: document.getElementById(`verif-1g-rango-${equipoId}`).value, v1g_obs: document.getElementById(`verif-1g-obs-${equipoId}`).value,
            v10g_p1: document.getElementById(`verif-10g-p1-${equipoId}`)?.value, v10g_p2: document.getElementById(`verif-10g-p2-${equipoId}`)?.value, v10g_p3: document.getElementById(`verif-10g-p3-${equipoId}`)?.value,
            v10g_rango: document.getElementById(`verif-10g-rango-${equipoId}`).value, v10g_obs: document.getElementById(`verif-10g-obs-${equipoId}`).value,
            v100g_p1: document.getElementById(`verif-100g-p1-${equipoId}`)?.value, v100g_p2: document.getElementById(`verif-100g-p2-${equipoId}`)?.value, v100g_p3: document.getElementById(`verif-100g-p3-${equipoId}`)?.value,
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
        const qVerif = query(collection(db, `equipos/${equipoId}/verificaciones`), orderBy("fecha", "desc"));
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
        data.id = docSnap.id; // Keep the document ID
        docs.push(data);
    });

    // Client-side sorting to avoid needing a composite index in Firestore
    docs.sort((a, b) => {
        const dateComparison = (b.fecha || '').localeCompare(a.fecha || '');
        if (dateComparison !== 0) return dateComparison;
        return (b.hora || '').localeCompare(a.hora || '');
    });

    if (docs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="21" style="padding: 8px; color: #888;">Aún no hay registros.</td></tr>';
    } else {
        docs.forEach(data => {
        const colorObs = (obs) => obs === 'No Conforme' ? 'color: #c0392b; font-weight: bold;' : (obs === 'Conforme' ? 'color: #217346; font-weight: bold;' : '');
        const tr = document.createElement('tr');
            tr.innerHTML = `<td style="padding: 5px;">${data.fecha || '-'}</td><td style="padding: 5px;">${data.hora || '-'}</td><td style="padding: 5px;">${data.temp ? data.temp + ' ºC' : '-'}</td><td style="padding: 5px;">${data.hr ? data.hr + '%' : '-'}</td><td style="padding: 5px;">${formatear(data.v1g_p1)}</td><td style="padding: 5px;">${formatear(data.v1g_p2)}</td><td style="padding: 5px;">${formatear(data.v1g_p3)}</td><td style="padding: 5px;">${formatear(data.v1g_rango)}</td><td style="padding: 5px; ${colorObs(data.v1g_obs)}">${data.v1g_obs || '-'}</td><td style="padding: 5px;">${formatear(data.v10g_p1)}</td><td style="padding: 5px;">${formatear(data.v10g_p2)}</td><td style="padding: 5px;">${formatear(data.v10g_p3)}</td><td style="padding: 5px;">${formatear(data.v10g_rango)}</td><td style="padding: 5px; ${colorObs(data.v10g_obs)}">${data.v10g_obs || '-'}</td><td style="padding: 5px;">${formatear(data.v100g_p1)}</td><td style="padding: 5px;">${formatear(data.v100g_p2)}</td><td style="padding: 5px;">${formatear(data.v100g_p3)}</td><td style="padding: 5px;">${formatear(data.v100g_rango)}</td><td style="padding: 5px; ${colorObs(data.v100g_obs)}">${data.v100g_obs || '-'}</td><td style="padding: 5px;">${data.responsable || '-'}</td><td style="padding: 5px;" class="no-export">${window.currentUserRole === 'visor' ? '<span style="color:#888;">Lectura</span>' : `<button class="delete-btn" style="padding: 2px 5px; font-size: 0.8em; cursor: pointer; background: #c0392b; color: #fff; border: none; border-radius: 3px;" onclick="eliminarVerificacion('${equipoId}', '${data.id}')">Eliminar</button>`}</td>`;
        tbody.appendChild(tr);
        });
    }
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

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPass').value;
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
        alert("Error al iniciar sesión: " + error.message);
    }
});

document.getElementById('btnLogout')?.addEventListener('click', async () => {
    await signOut(auth);
});

const inspectionTasks = [
    "VERIFICAR LA LIMPIEZA DEL PROTECTOR DE ACRILICO",
    "VERIFICAR LA LIMPIEZA DE LA CUBIERTA TRANSPARENTE DE LA BALANZA",
    "VERIFICAR LA LIMPIEZA DEL PLATILLO CIRCULAR, SOPORTE DE 3 PUNTAS, ARO Y PLATILLO INTERNO",
    "VERIFICAR LA LIMPIEZA DE LA BASE DE LA CAMARA Y EL RIEL DE LA PUERTA",
    "",
    "",
    ""
];
const inspectionMonths = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

function generateInspectionTable(containerId, equipoId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let headerHtml = `
        <div style="text-align: center; font-weight: bold;">LABORATORIO DE ENSAYOS TEXTILES</div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
            <span></span>
            <span>pág. 1 de 2</span>
        </div>
        <div style="text-align: center; font-weight: bold; margin-bottom: 15px;">PROGRAMA DE INSPECCIÓN, MANTENIMIENTO PREVENTIVO Y VERIFICACIÓN</div>
        
        <table style="width: 100%; border-collapse: collapse; font-size: 0.8em; margin-bottom: 15px;" border="1">
            <tr>
                <td style="padding: 4px;"><b>EQUIPO</b></td>
                <td colspan="10" style="padding: 4px;">BALANZA ANALITICA Serie PR - OHAUS - PR224ZH</td>
                <td style="padding: 4px;"><b>CÓDIGO</b></td>
                <td colspan="5" style="padding: 4px;">LabT-157-23</td>
            </tr>
            <tr>
                <td style="padding: 4px;"><b>No. INVENTARIO</b></td>
                <td colspan="10" style="padding: 4px;"><input type="text" id="insp-inventario-${equipoId}" style="width: 100%; border: none; background: transparent;"></td>
                <td style="padding: 4px;"><b>AÑO</b></td>
                <td colspan="5" style="padding: 4px;"><input type="number" id="insp-year-${equipoId}" value="${new Date().getFullYear()}" style="width: 80px; border: none; background: transparent; font-weight: bold;"></td>
            </tr>
            <tr>
                <td style="padding: 4px;"><b>No. SERIE</b></td>
                <td colspan="10" style="padding: 4px;"><input type="text" id="insp-serie-${equipoId}" value="C134798453" style="width: 100%; border: none; background: transparent;"></td>
                <td colspan="6"></td>
            </tr>
        </table>
    `;

    let tableHeader = `
        <thead>
            <tr>
                <th rowspan="2">Nº</th>
                <th rowspan="2" style="min-width: 250px;">TAREAS</th>
                <th rowspan="2">FREC.</th>
                ${inspectionMonths.map(m => `<th colspan="4">${m}</th>`).join('')}
            </tr>
            <tr>
                ${inspectionMonths.map(() => `<th>1</th><th>2</th><th>3</th><th>4</th>`).join('')}
            </tr>
        </thead>
    `;

    let tableBody = '<tbody>';
    inspectionTasks.forEach((task, index) => {
        tableBody += `<tr data-task-id="${index + 1}">`;
        tableBody += `<td>${index + 1}</td>`;
        tableBody += `<td style="text-align: left; padding: 4px;">${task}</td>`;
        tableBody += `<td>${task ? 'S' : ''}</td>`;
        if (task) {
            inspectionMonths.forEach(month => {
                for (let week = 1; week <= 4; week++) {
                    tableBody += `<td><span class="insp-status" data-task="${index + 1}" data-month="${month}" data-week="${week}" style="cursor: pointer; font-weight: bold; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; min-height: 20px;">O</span></td>`;
                }
            });
        } else {
            tableBody += `<td colspan="${inspectionMonths.length * 4}"></td>`;
        }
        tableBody += `</tr>`;
    });
    tableBody += '</tbody>';

    let tableFooter = '<tfoot>';
    tableFooter += '<tr><td colspan="3" style="text-align: left; font-weight: bold; padding: 4px;">FECHA DE LA EJECUCIÓN DEL PROGRAMA (Según tarea)</td>';
    inspectionMonths.forEach(month => {
        for (let week = 1; week <= 4; week++) {
            tableFooter += `<td><input type="text" class="insp-date" data-month="${month}" data-week="${week}" style="width: 100%; border: none; font-size: 0.9em; text-align: center; box-sizing: border-box;"></td>`;
        }
    });
    tableFooter += '</tr>';
    tableFooter += '<tr><td colspan="3" style="text-align: left; font-weight: bold; padding: 4px;">FIRMA DEL RESPONSABLE DE LA EJECUCIÓN DEL PROGRAMA</td>';
    inspectionMonths.forEach(month => {
        for (let week = 1; week <= 4; week++) {
            tableFooter += `<td><input type="text" class="insp-signature" data-month="${month}" data-week="${week}" style="width: 100%; border: none; font-size: 0.9em; text-align: center; box-sizing: border-box;"></td>`;
        }
    });
    tableFooter += '</tr>';
    tableFooter += '</tfoot>';

    let footerHtml = `
        <div style="display: flex; justify-content: space-between; margin-top: 20px; font-size: 0.8em; flex-wrap: wrap; gap: 15px;">
            <div style="flex: 2; min-width: 250px;">
                <b>OBSERVACIONES:</b>
                <textarea id="insp-observaciones-${equipoId}" style="width: 95%; height: 60px; margin-top: 5px; box-sizing: border-box;"></textarea>
            </div>
            <div style="flex: 1; min-width: 120px;">
                <b>FRECUENCIA:</b><br>D = Diario<br>S = Semanal<br>Q = Quincenal<br>M = mensual<br>T = Trimestral<br>Sm = Semestral<br>A = Anual
            </div>
            <div style="flex: 1; min-width: 100px;">
                <b>CLAVE:</b><br>V = Conforme<br>X = Con falla<br>O = Pendiente
            </div>
        </div>
        <div style="margin-top: 10px; font-size: 0.7em;">F015-SEN-DIRE-25</div>
        ${window.currentUserRole !== 'visor' ? `<button type="button" id="btnGuardarInspeccion-${equipoId}" class="btn-primary" style="margin-top: 15px; cursor: pointer;">Guardar Programa</button>` : ''}
    `;

    container.innerHTML = `
        ${headerHtml}
        <div style="overflow-x: auto;">
            <table id="tablaInspeccion-${equipoId}" style="width: 100%; border-collapse: collapse; font-size: 0.75em; text-align: center;" border="1">
                ${tableHeader}
                ${tableBody}
                ${tableFooter}
            </table>
        </div>
        ${footerHtml}
    `;

    if (window.currentUserRole !== 'visor') {
        container.querySelectorAll('.insp-status').forEach(span => {
            span.addEventListener('click', () => {
                switch (span.innerText) {
                    case 'O': span.innerText = 'V'; span.style.color = '#217346'; break;
                    case 'V': span.innerText = 'X'; span.style.color = '#c0392b'; break;
                    case 'X': span.innerText = 'O'; span.style.color = 'black'; break;
                }
            });
        });

        const saveBtn = document.getElementById(`btnGuardarInspeccion-${equipoId}`);
        if (saveBtn) {
            saveBtn.addEventListener('click', () => guardarProgramaInspeccion(equipoId));
        }
    }
}

async function guardarProgramaInspeccion(equipoId) {
    const container = document.getElementById(`mantenimiento-${equipoId}`);
    if (!container) return;

    const programData = {
        year: document.getElementById(`insp-year-${equipoId}`).value,
        inventario: document.getElementById(`insp-inventario-${equipoId}`).value,
        serie: document.getElementById(`insp-serie-${equipoId}`).value,
        tasks: {},
        dates: {},
        signatures: {},
        observations: document.getElementById(`insp-observaciones-${equipoId}`).value,
        lastUpdated: new Date().toISOString()
    };

    container.querySelectorAll('.insp-status').forEach(span => {
        const task = span.dataset.task;
        const month = span.dataset.month;
        const week = span.dataset.week;
        if (!programData.tasks[task]) programData.tasks[task] = {};
        if (!programData.tasks[task][month]) programData.tasks[task][month] = {};
        programData.tasks[task][month][week] = span.innerText;
    });

    container.querySelectorAll('.insp-date').forEach(input => {
        const month = input.dataset.month;
        const week = input.dataset.week;
        if (!programData.dates[month]) programData.dates[month] = {};
        programData.dates[month][week] = input.value;
    });

    container.querySelectorAll('.insp-signature').forEach(input => {
        const month = input.dataset.month;
        const week = input.dataset.week;
        if (!programData.signatures[month]) programData.signatures[month] = {};
        programData.signatures[month][week] = input.value;
    });

    try {
        await updateDoc(doc(db, "equipos", equipoId), { inspectionProgram: programData });
        alert("Programa de inspección guardado exitosamente.");
    } catch (error) {
        console.error("Error al guardar el programa de inspección: ", error);
        alert("Error al guardar: " + error.message);
    }
}

async function cargarProgramaInspeccion(equipoId) {
    const docSnap = await getDoc(doc(db, "equipos", equipoId));
    if (!docSnap.exists() || !docSnap.data().inspectionProgram) {
        return;
    }
    const programData = docSnap.data().inspectionProgram;
    const container = document.getElementById(`mantenimiento-${equipoId}`);
    if (!container) return;

    if (programData.year) document.getElementById(`insp-year-${equipoId}`).value = programData.year;
    if (programData.inventario) document.getElementById(`insp-inventario-${equipoId}`).value = programData.inventario;
    if (programData.serie) document.getElementById(`insp-serie-${equipoId}`).value = programData.serie;
    if (programData.observations) document.getElementById(`insp-observaciones-${equipoId}`).value = programData.observations;

    if (programData.tasks) {
        for (const task in programData.tasks) {
            for (const month in programData.tasks[task]) {
                for (const week in programData.tasks[task][month]) {
                    const status = programData.tasks[task][month][week];
                    const span = container.querySelector(`.insp-status[data-task="${task}"][data-month="${month}"][data-week="${week}"]`);
                    if (span) {
                        span.innerText = status;
                        if (status === 'V') span.style.color = '#217346';
                        else if (status === 'X') span.style.color = '#c0392b';
                        else span.style.color = 'black';
                    }
                }
            }
        }
    }

    if (programData.dates) {
        for (const month in programData.dates) {
            for (const week in programData.dates[month]) {
                const input = container.querySelector(`.insp-date[data-month="${month}"][data-week="${week}"]`);
                if (input) input.value = programData.dates[month][week];
            }
        }
    }

    if (programData.signatures) {
        for (const month in programData.signatures) {
            for (const week in programData.signatures[month]) {
                const input = container.querySelector(`.insp-signature[data-month="${month}"][data-week="${week}"]`);
                if (input) input.value = programData.signatures[month][week];
            }
        }
    }
}