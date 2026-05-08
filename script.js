import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, getDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBR88EcYJPL3xIdr5X_p8cx2TEjz7LuzpM",
    authDomain: "lab-cttc.firebaseapp.com",
    projectId: "lab-cttc",
    storageBucket: "lab-cttc.firebasestorage.app",
    messagingSenderId: "588785890026",
    appId: "1:588785890026:web:27ec4ea43a8a749989dd93"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const colRef = collection(db, "gramajes");

let editandoId = null;
let currentOT = null;
let currentMuestra = null;
let currentEnsayo = null;
let esRepeticionActiva = false;

const mockEnsayos = [
    "Control de Gramaje y Rendimiento",
    "Solides",
    "Encogimiento"
];

// Simulación de las Órdenes de Trabajo (OT)
const mockOTs = [
    { id: "OT-2026-001", muestras: ["MUE-A100", "MUE-A101"], estado: "Terminado" },
    { id: "OT-2026-002", muestras: ["MUE-B200"], estado: "Terminado" },
    { id: "OT-2026-003", muestras: ["MUE-C300", "MUE-C301", "MUE-C302"], estado: "Pendiente" }
];

// --- Función de Cálculo de Diferencia Crítica ---
function calcularDiferenciaCritica() {
    const rows = document.getElementById('resultadoCuerpo').querySelectorAll('tr');
    const panel = document.getElementById('panelDiferencia');
    
    // Necesitamos al menos 2 registros para comparar
    if (rows.length >= 2) {
        // Asumimos que toma los dos más recientes (rows[0] es el último ingresado, rows[1] es el anterior)
        // Columna 6 corresponde a "Promedio (g/m²)"
        const valB = parseFloat(rows[0].cells[6].innerText); // Equivalente a J25 (Repetición)
        const valA = parseFloat(rows[1].cells[6].innerText); // Equivalente a J22 (Original)
        
        if (!isNaN(valA) && !isNaN(valB) && valA !== 0) {
            // 1. Diferencia simple: =ABS(J22-J25)
            const difSimple = Math.abs(valA - valB);
            
            // 2. Margen: =ABS(((J25*100)/J22)-100)/100
            const margen = Math.abs(((valB * 100) / valA) - 100) / 100;
            
            // 3. Diferencia crítica final: diferencia simple - margen
            const difCriticaFinal = difSimple - margen;
            
            document.getElementById('difSimpleVal').innerText = difSimple.toFixed(4);
            document.getElementById('difMargenVal').innerText = (margen * 100).toFixed(1) + "%"; // Muestra un decimal (Ej: 28.6%)
            document.getElementById('difCriticaVal').innerText = difCriticaFinal.toFixed(4);
            
            document.getElementById('difValoresEvaluados').innerText = `Valores evaluados (Promedio g/m²): Original (J22) = ${valA} | Repetición (J25) = ${valB}`;
            
            const msg = document.getElementById('difCriticaMsg');
            msg.innerText = margen < 0.03 ? "✅ Cumple con el margen (˂ 3%)" : "❌ No cumple con el margen (≥ 3%)";
            msg.style.color = margen < 0.03 ? "#217346" : "#c0392b";
            
            panel.style.display = 'block';
            return;
        }
    }
    panel.style.display = 'none'; // Ocultar si hay menos de 2 registros
}

// --- Función de Cálculo Opción C ---
function calcularOpcionC() {
    const rows = document.getElementById('resultadoCuerpo').querySelectorAll('tr');
    const panel = document.getElementById('panelOpcionC');
    let rowOriginal = null;

    // Buscar el registro original más reciente (que NO sea repetición)
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].cells[3].innerText === 'No') {
            rowOriginal = rows[i];
            break; // Tomamos el primero que cumpla (el más reciente)
        }
    }

    if (rowOriginal) {
        const ancho = parseFloat(rowOriginal.cells[2].innerText); // Ancho en mm
        const pesosStr = rowOriginal.cells[4].innerText;
        const gramajesStr = rowOriginal.cells[5].innerText;

        if (!isNaN(ancho) && ancho > 0 && pesosStr !== '-' && gramajesStr !== '-') {
            const pesos = pesosStr.split(',').map(p => parseFloat(p));
            const gramajes = gramajesStr.split(',').map(g => parseFloat(g));
            const numProbetas = pesos.length;
            
            const gmList = [], mkgList = [], ozyd2List = [], ozydList = [], ydlbList = [];

            for (let i = 0; i < numProbetas; i++) {
                const gr_m2 = gramajes[i];
                
                // g/m: g/m2 * ancho(m) - Se multiplica para obtener la masa lineal correcta
                const g_m = gr_m2 * (ancho / 1000);
                gmList.push(g_m);

                // m/Kg: 1000 / g/m
                const m_kg = g_m > 0 ? 1000 / g_m : 0;
                mkgList.push(m_kg);

                // Oz/yd²: g/m2 / 33.906
                const oz_yd2 = gr_m2 / 33.906;
                ozyd2List.push(oz_yd2);

                // Oz/yd: Oz/yd2 * ancho(yd) -> 1 mm = 1/914.4 yd
                const oz_yd = oz_yd2 * (ancho / 914.4);
                ozydList.push(oz_yd);

                // yd/lb: 16 / Oz/yd
                const yd_lb = oz_yd > 0 ? 16 / oz_yd : 0;
                ydlbList.push(yd_lb);
            }

            const promediar = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

            const renderRow = (title, arr) => {
                let html = `<tr><td style="font-weight: bold; text-align: left; padding: 8px; border: 1px solid #ccc;">${title}</td>`;
                arr.forEach(val => html += `<td style="padding: 8px; border: 1px solid #ccc;">${parseFloat(val.toFixed(4))}</td>`);
                html += `<td style="padding: 8px; border: 1px solid #ccc; font-weight: bold; background: #e6f4ea;">${parseFloat(promediar(arr).toFixed(4))}</td></tr>`;
                return html;
            };

            let headHtml = `<tr><th style="padding: 8px; border: 1px solid #ccc; background: #f3f3f3;">Resultado Opción C</th>`;
            for(let i = 1; i <= numProbetas; i++) headHtml += `<th style="padding: 8px; border: 1px solid #ccc; background: #f3f3f3;">Probeta ${i}</th>`;
            headHtml += `<th style="padding: 8px; border: 1px solid #ccc; background: #f3f3f3;">Promedio</th></tr>`;
            
            document.getElementById('headOpcionC').innerHTML = headHtml;
            document.getElementById('bodyOpcionC').innerHTML = renderRow("g/m (Gramo/metro lineal)", gmList) + renderRow("m/Kg (Metro lineal/Kg)", mkgList) + renderRow("Oz/yd² (Onza/yarda cuadrada)", ozyd2List) + renderRow("Oz/yd (Onza/yarda lineal)", ozydList) + renderRow("yd/lb (Yarda lineal/libra)", ydlbList);
            panel.style.display = 'block';
            return;
        }
    }
    panel.style.display = 'none'; // Ocultar si no hay registro original válido
}

// --- Generador de la Tabla de Eficacia ---
function generarTablasEficacia() {
    const container = document.getElementById('contenedorTablasEficacia');
    if (container.innerHTML !== '') return; // Evitar regenerar si ya existe
    
    let html = '';
    html += generarBloqueAnalistasEficacia('A1', 'A2');
    html += generarBloqueAnalistasEficacia('A3', 'A4');
    container.innerHTML = html;

    // Añadir listeners para calcular el promedio (g/m2) automáticamente
    const inputs = container.querySelectorAll('.efi-input');
    inputs.forEach(input => {
        input.addEventListener('input', calcularPromedioEficacia);
    });
}

function generarBloqueAnalistasEficacia(id1, id2) {
    let rows = '';
    for (let i = 1; i <= 10; i++) {
        rows += `
        <tr>
            <td style="text-align: center; font-weight: bold; padding: 5px;">${i}</td>
            <td style="padding: 2px;"><input type="number" step="0.0001" class="efi-input efi-row-${id1}-${i}" data-analista="${id1}" data-row="${i}" style="width: 100%; box-sizing: border-box; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 3px;"></td>
            <td style="padding: 2px;"><input type="number" step="0.0001" class="efi-input efi-row-${id1}-${i}" data-analista="${id1}" data-row="${i}" style="width: 100%; box-sizing: border-box; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 3px;"></td>
            <td style="padding: 2px;"><input type="number" step="0.0001" class="efi-input efi-row-${id1}-${i}" data-analista="${id1}" data-row="${i}" style="width: 100%; box-sizing: border-box; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 3px;"></td>
            <td style="background: #eef; font-weight: bold; text-align: center; padding: 5px;" id="efi-prom-${id1}-${i}">-</td>
            <td style="text-align: center; font-weight: bold; border-left: 2px solid #004a8f; padding: 5px;">${i}</td>
            <td style="padding: 2px;"><input type="number" step="0.0001" class="efi-input efi-row-${id2}-${i}" data-analista="${id2}" data-row="${i}" style="width: 100%; box-sizing: border-box; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 3px;"></td>
            <td style="padding: 2px;"><input type="number" step="0.0001" class="efi-input efi-row-${id2}-${i}" data-analista="${id2}" data-row="${i}" style="width: 100%; box-sizing: border-box; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 3px;"></td>
            <td style="padding: 2px;"><input type="number" step="0.0001" class="efi-input efi-row-${id2}-${i}" data-analista="${id2}" data-row="${i}" style="width: 100%; box-sizing: border-box; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 3px;"></td>
            <td style="background: #eef; font-weight: bold; text-align: center; padding: 5px;" id="efi-prom-${id2}-${i}">-</td>
        </tr>`;
    }
    
    return `
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 0.9em;" border="1">
        <thead style="background: #f3f3f3;">
            <tr>
                <th colspan="5" style="padding: 10px;">Analista ${id1}: <input type="text" placeholder="Nombre" style="padding: 5px; width: 60%; margin-left: 10px;"></th>
                <th colspan="5" style="padding: 10px; border-left: 2px solid #004a8f;">Analista ${id2}: <input type="text" placeholder="Nombre" style="padding: 5px; width: 60%; margin-left: 10px;"></th>
            </tr>
            <tr>
                <th style="padding: 8px;">#</th>
                <th style="padding: 8px;">Gramaje 1</th><th style="padding: 8px;">Gramaje 2</th><th style="padding: 8px;">Gramaje 3</th><th style="padding: 8px;">g/m²</th>
                <th style="border-left: 2px solid #004a8f; padding: 8px;">#</th>
                <th style="padding: 8px;">Gramaje 1</th><th style="padding: 8px;">Gramaje 2</th><th style="padding: 8px;">Gramaje 3</th><th style="padding: 8px;">g/m²</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;
}

function calcularPromedioEficacia(e) {
    const analista = e.target.getAttribute('data-analista');
    const row = e.target.getAttribute('data-row');
    const inputs = document.querySelectorAll(`.efi-row-${analista}-${row}`);
    
    let sum = 0; let count = 0;
    inputs.forEach(inp => {
        const val = parseFloat(inp.value);
        if (!isNaN(val)) { sum += val; count++; }
    });
    
    const cellProm = document.getElementById(`efi-prom-${analista}-${row}`);
    cellProm.innerText = count > 0 ? parseFloat((sum / count).toFixed(4)) : '-';
}

// Carga de datos iniciales filtrados por la OT y Muestra seleccionadas
async function cargarDatos() {
    if (!currentOT || !currentMuestra) return;
    const q = query(colRef, orderBy("fecha", "desc"));
    const snapshot = await getDocs(q);
    document.getElementById('resultadoCuerpo').innerHTML = "";
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.otId === currentOT.id && data.codigoMuestra === currentMuestra) {
            renderFila(doc.id, data);
        }
    });
    calcularDiferenciaCritica();
    calcularOpcionC();
}

// Generar inputs dinámicos para los pesos
function generarInputsPesos(num) {
    const contenedor = document.getElementById('contenedorPesos');
    contenedor.innerHTML = '';
    for (let i = 1; i <= num; i++) {
        const input = document.createElement('input');
        input.type = 'number';
            input.step = '0.0001';
        input.className = 'peso-probeta';
        input.placeholder = `Peso Probeta ${i} (g)`;
        input.required = true;
        contenedor.appendChild(input);
    }
}

generarInputsPesos(5); // Generar 5 casillas por defecto

// Mostrar aviso según el tipo de corte
document.getElementById('tipoCorte').addEventListener('change', (e) => {
    const aviso = document.getElementById('avisoCorte');
    if (e.target.value === 'CIRCULAR') {
        aviso.textContent = "Área total de cortes (Certificado:IT-227-2024 ) - Corte forma Circular y el area debe ser 0.020042 m2";
        aviso.style.display = 'block';
    } else if (e.target.value === 'CUADRADO') {
        aviso.textContent = "Área total de cortes (Certificado:IT-227-2024 ) - Corte forma Cuadrado y el area debe ser 0.5 m2";
        aviso.style.display = 'block';
    } else {
        aviso.style.display = 'none';
    }
});

// Escuchar cambios en la cantidad de probetas
document.getElementById('numProbetas').addEventListener('input', (e) => {
    const num = parseInt(e.target.value) || 0;
    if (num > 0) {
        generarInputsPesos(num);
    }
});

// Lógica de cálculo y guardado
document.getElementById('gramajeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const tipoCorteSeleccionado = document.getElementById('tipoCorte').value;
    let areaCalculada = 0;
    if (tipoCorteSeleccionado === 'CIRCULAR') {
        areaCalculada = 0.020042;
    } else if (tipoCorteSeleccionado === 'CUADRADO') {
        areaCalculada = 0.5;
    }
    
    const inputsPesos = document.querySelectorAll('.peso-probeta');
    const pesos = [];
    const gramajesInd = [];
    let sumaGramajes = 0;
    let sumaPesos = 0;
    inputsPesos.forEach(input => {
        const val = parseFloat(input.value) || 0;
        const pesoRedondeado = parseFloat(val.toFixed(4));
        pesos.push(pesoRedondeado);
        sumaPesos += pesoRedondeado;
        
        // Cálculo individual por cada probeta (Peso / Área)
        const grInd = pesoRedondeado / areaCalculada;
        gramajesInd.push(parseFloat(grInd.toFixed(4)));
        sumaGramajes += grInd;
    });

    // Promedio de los gramajes calculados
    const grPromedio = inputsPesos.length > 0 ? parseFloat((sumaGramajes / inputsPesos.length).toFixed(4)) : 0;

    const data = {
        otId: currentOT.id,
        codigoMuestra: currentMuestra,
        esRepeticion: esRepeticionActiva,
        tipoCorte: tipoCorteSeleccionado,
        area: areaCalculada,
        numProbetas: parseInt(document.getElementById('numProbetas').value),
        anchoEspecimen: parseFloat(document.getElementById('anchoEspecimen').value),
        pesos: pesos,
        gramajesInd: gramajesInd,
        pesoTotal: sumaPesos,
        gr: parseFloat(grPromedio),
        fecha: new Date().toISOString()
    };

    if (editandoId) {
        await updateDoc(doc(db, "gramajes", editandoId), data);
        const row = document.getElementById(editandoId);
        if (row) {
            const repeticionDisplay = data.esRepeticion ? '<span style="color: #d97706; font-weight: bold;">Sí</span>' : 'No';
                const pesosDisplay = data.pesos ? data.pesos.map(p => parseFloat(Number(p).toFixed(4)) + 'g').join(', ') : '-';
            const anchoDisplay = data.anchoEspecimen != null ? Number(data.anchoEspecimen).toFixed(2) + ' mm' : '-';
                const gramajesIndDisplay = data.gramajesInd ? data.gramajesInd.map(g => parseFloat(Number(g).toFixed(4))).join(', ') : '-';
                const grDisplay = data.gr !== undefined ? parseFloat(Number(data.gr).toFixed(4)) : '-';
            row.innerHTML = `
                <td>${data.tipoCorte || '-'}</td>
                <td>${data.numProbetas || '-'}</td>
                <td>${anchoDisplay}</td>
                <td>${repeticionDisplay}</td>
                <td>${pesosDisplay}</td>
                <td>${gramajesIndDisplay}</td>
                <td>${grDisplay}</td>
                <td class="no-export">
                    <button class="edit-btn" onclick="editarRegistro('${editandoId}')">Editar</button>
                    <button class="delete-btn" onclick="eliminarRegistro('${editandoId}')">Eliminar</button>
                </td>
            `;
        }
        editandoId = null;
        document.querySelector('#gramajeForm button[type="submit"]').textContent = "Añadir Registro";
    } else {
        const docRef = await addDoc(colRef, data);
        renderFila(docRef.id, data);
    }

    esRepeticionActiva = false;
    document.getElementById('badgeRepeticion').style.display = 'none';
    e.target.reset();
    generarInputsPesos(5); // Volver a las 5 casillas originales
    document.getElementById('avisoCorte').style.display = 'none';
    calcularDiferenciaCritica();
    calcularOpcionC();
});

function renderFila(id, data) {
    const row = document.createElement('tr');
    row.id = id;
    const repeticionDisplay = data.esRepeticion ? '<span style="color: #d97706; font-weight: bold;">Sí</span>' : 'No';
    // Damos formato visual para mostrar los pesos separados por comas
    const anchoDisplay = data.anchoEspecimen != null ? Number(data.anchoEspecimen).toFixed(2) + ' mm' : '-';
    const pesosDisplay = data.pesos ? data.pesos.map(p => parseFloat(Number(p).toFixed(4)) + 'g').join(', ') : '-';
    const gramajesIndDisplay = data.gramajesInd ? data.gramajesInd.map(g => parseFloat(Number(g).toFixed(4))).join(', ') : '-';
    const grDisplay = data.gr !== undefined ? parseFloat(Number(data.gr).toFixed(4)) : '-';
    row.innerHTML = `
        <td>${data.tipoCorte || '-'}</td>
        <td>${data.numProbetas || '-'}</td>
        <td>${anchoDisplay}</td>
        <td>${repeticionDisplay}</td>
        <td>${pesosDisplay}</td>
        <td>${gramajesIndDisplay}</td>
        <td>${grDisplay}</td>
        <td class="no-export">
            <button class="edit-btn" onclick="editarRegistro('${id}')">Editar</button>
            <button class="delete-btn" onclick="eliminarRegistro('${id}')">Eliminar</button>
        </td>
    `;
    document.getElementById('resultadoCuerpo').prepend(row);
}

// Acción para el botón de Repetición (mantiene configuración, limpia pesos)
document.getElementById('btnRepeticion').addEventListener('click', () => {
    editandoId = null;
    esRepeticionActiva = true;
    document.getElementById('badgeRepeticion').style.display = 'inline-block';
    document.querySelector('#gramajeForm button[type="submit"]').textContent = "Añadir Registro";
    
    const inputsPesos = document.querySelectorAll('.peso-probeta');
    inputsPesos.forEach(input => input.value = ''); // Limpiar solo las casillas de los pesos
    
    if(inputsPesos.length > 0) inputsPesos[0].focus(); // Poner el cursor en la primera probeta
    window.scrollTo({ top: 0, behavior: 'smooth' }); // Subir la pantalla hacia el formulario
});

document.getElementById('btnExportar').addEventListener('click', () => {
    const table = document.getElementById('tablaDatos');
    const tempTable = table.cloneNode(true);
    
    // Limpiar columna de acciones para el reporte final
    tempTable.querySelectorAll('.no-export').forEach(el => el.remove());

    const wb = XLSX.utils.table_to_book(tempTable, { sheet: "Data de Gramaje" });
    XLSX.writeFile(wb, `Reporte_CTTC_${new Date().toISOString().split('T')[0]}.xlsx`);
});

// Función global para eliminar
window.eliminarRegistro = async (id) => {
    if(confirm("¿Desea borrar este registro de la base de datos?")) {
        await deleteDoc(doc(db, "gramajes", id));
        document.getElementById(id).remove();
        calcularDiferenciaCritica();
        calcularOpcionC();
    }
};

// Función global para editar
window.editarRegistro = async (id) => {
    const docSnap = await getDoc(doc(db, "gramajes", id));
    if (docSnap.exists()) {
        const data = docSnap.data();
        
        esRepeticionActiva = data.esRepeticion || false;
        document.getElementById('badgeRepeticion').style.display = esRepeticionActiva ? 'inline-block' : 'none';

        document.getElementById('tipoCorte').value = data.tipoCorte;
        document.getElementById('tipoCorte').dispatchEvent(new Event('change')); // Muestra el aviso correcto
        
        document.getElementById('numProbetas').value = data.numProbetas;
        document.getElementById('anchoEspecimen').value = data.anchoEspecimen || '';
        generarInputsPesos(data.numProbetas);
        
        const inputsPesos = document.querySelectorAll('.peso-probeta');
        if (data.pesos) {
            data.pesos.forEach((peso, index) => {
                if(inputsPesos[index]) inputsPesos[index].value = peso;
            });
        }
        
        editandoId = id;
        document.querySelector('#gramajeForm button[type="submit"]').textContent = "Actualizar Registro";
        window.scrollTo({ top: 0, behavior: 'smooth' }); // Llevar la pantalla hacia arriba
    }
};

// --- Lógica de Autenticación (Login / Registro) ---

// Monitor del estado de sesión
onAuthStateChanged(auth, (user) => {
    const authSection = document.getElementById('authSection');
    const appSection = document.getElementById('appSection');
    
    if (user) {
        // Usuario logueado: mostrar app, ocultar login
        if (authSection) authSection.style.display = 'none';
        if (appSection) appSection.style.display = 'block';
        const userDisplay = document.getElementById('userDisplay');
        if (userDisplay) userDisplay.textContent = user.email;
    } else {
        // Sin sesión: mostrar login, ocultar app
        if (authSection) authSection.style.display = 'block';
        if (appSection) appSection.style.display = 'none';
    }
});

// Iniciar Sesión
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

// Crear Nueva Cuenta y registrar en colección 'analistas'
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('regEmail').value;
    const pass = document.getElementById('regPass').value;
    const nombre = document.getElementById('regNombre').value;
    const cargo = document.getElementById('regCargo').value; // Dato extra de ejemplo
    
    try {
        // Crear usuario en Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;
        
        // Guardar datos adicionales en Firestore (colección 'analistas')
        await setDoc(doc(db, "analistas", user.uid), {
            email: email,
            nombre: nombre,
            cargo: cargo,
            fechaCreacion: new Date().toISOString()
        });
        
        alert("Cuenta de analista creada exitosamente");
    } catch (error) {
        alert("Error al registrar la cuenta: " + error.message);
    }
});

// Cerrar Sesión
document.getElementById('btnLogout')?.addEventListener('click', async () => {
    await signOut(auth);
});

// Alternar entre Login y Registro
document.getElementById('btnShowRegister')?.addEventListener('click', () => {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('registerContainer').style.display = 'block';
});
document.getElementById('btnShowLogin')?.addEventListener('click', () => {
    document.getElementById('registerContainer').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'block';
});

// --- Lógica de la Bandeja de Órdenes de Trabajo ---
function renderOTTray() {
    const otList = document.getElementById('otList');
    otList.innerHTML = '';
    mockOTs.forEach(ot => {
        const div = document.createElement('div');
        div.style = "border: 1px solid #ccc; padding: 15px; cursor: pointer; border-radius: 5px; background: #fff; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: background 0.2s;";
        div.onmouseover = () => div.style.background = '#f9f9f9';
        div.onmouseout = () => div.style.background = '#fff';
        div.innerHTML = `
            <div><strong style="font-size: 1.1em; color: #004a8f;">${ot.id}</strong></div>
            <div><span style="font-weight: bold; color: ${ot.estado === 'Terminado' ? '#217346' : '#d97706'}; background: ${ot.estado === 'Terminado' ? '#e6f4ea' : '#fef3c7'}; padding: 5px 10px; border-radius: 15px; font-size: 0.9em;">${ot.estado}</span></div>
        `;
        div.onclick = () => mostrarMuestras(ot);
        otList.appendChild(div);
    });
}

function mostrarMuestras(ot) {
    currentOT = ot;
    document.getElementById('otTray').style.display = 'none';
    document.getElementById('muestraTray').style.display = 'block';
    document.getElementById('muestraTrayTitle').innerHTML = `Muestras de la OT: <span style="color: #004a8f;">${ot.id}</span>`;
    
    const muestraList = document.getElementById('muestraList');
    muestraList.innerHTML = '';
    ot.muestras.forEach(muestra => {
        const div = document.createElement('div');
        div.style = "border: 1px solid #ccc; padding: 15px; cursor: pointer; border-radius: 5px; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: background 0.2s; font-weight: bold; color: #333;";
        div.onmouseover = () => div.style.background = '#f9f9f9';
        div.onmouseout = () => div.style.background = '#fff';
        div.innerHTML = `📄 ${muestra}`;
        div.onclick = () => seleccionarMuestra(muestra);
        muestraList.appendChild(div);
    });
}

function seleccionarMuestra(muestra) {
    currentMuestra = muestra;
    document.getElementById('muestraTray').style.display = 'none';
    document.getElementById('ensayoTray').style.display = 'block';
    document.getElementById('ensayoTrayTitle').innerHTML = `Ensayos para la Muestra: <span style="color: #004a8f;">${muestra}</span> (OT: ${currentOT.id})`;
    renderEnsayoTray();
}

function renderEnsayoTray() {
    const ensayoList = document.getElementById('ensayoList');
    ensayoList.innerHTML = '';
    mockEnsayos.forEach(ensayo => {
        const div = document.createElement('div');
        div.style = "border: 1px solid #ccc; padding: 15px; cursor: pointer; border-radius: 5px; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: background 0.2s; font-weight: bold; color: #333;";
        div.onmouseover = () => div.style.background = '#f9f9f9';
        div.onmouseout = () => div.style.background = '#fff';
        div.innerHTML = `🔬 ${ensayo}`;
        div.onclick = () => seleccionarEnsayo(ensayo);
        ensayoList.appendChild(div);
    });
}

function seleccionarEnsayo(ensayo) {
    currentEnsayo = ensayo;
    document.getElementById('ensayoTray').style.display = 'none';
    document.getElementById('mainWorkArea').style.display = 'block';
    document.getElementById('currentOtDisplay').innerHTML = `<strong>OT:</strong> ${currentOT.id} &nbsp;|&nbsp; <strong>Muestra:</strong> <span style="color:#004a8f;">${currentMuestra}</span> &nbsp;|&nbsp; <strong>Ensayo:</strong> <span style="color:#004a8f;">${ensayo}</span>`;
    
    // Mostrar el encabezado superior y actualizar el título dinámicamente
    document.getElementById('headerApp').style.display = 'flex';
    document.getElementById('tituloEnsayo').textContent = ensayo;

    if (ensayo === "Control de Gramaje y Rendimiento") {
        document.getElementById('toolbarEnsayo').style.display = '';
        document.getElementById('areaGramaje').style.display = 'block';
        document.getElementById('ensayoConstruccion').style.display = 'none';
        cargarDatos();
    } else {
        document.getElementById('toolbarEnsayo').style.display = 'none';
        document.getElementById('areaGramaje').style.display = 'none';
        document.getElementById('ensayoConstruccion').style.display = 'block';
        document.getElementById('resultadoCuerpo').innerHTML = ""; 
    }
}

document.getElementById('btnVolverAOTs').addEventListener('click', () => {
    currentOT = null;
    document.getElementById('muestraTray').style.display = 'none';
    document.getElementById('otTray').style.display = 'block';
});

document.getElementById('btnVolverAMuestras').addEventListener('click', () => {
    currentMuestra = null;
    document.getElementById('ensayoTray').style.display = 'none';
    document.getElementById('muestraTray').style.display = 'block';
});

document.getElementById('btnVolverAEnsayos').addEventListener('click', () => {
    currentEnsayo = null;
    document.getElementById('mainWorkArea').style.display = 'none';
    document.getElementById('headerApp').style.display = 'none';
    document.getElementById('ensayoTray').style.display = 'block';
});

// --- Lógica de Selección para Incertidumbre ---
function renderIncertidumbreEnsayos() {
    const list = document.getElementById('incertidumbreEnsayoList');
    if (!list) return;
    list.innerHTML = '';
    mockEnsayos.forEach(ensayo => {
        const div = document.createElement('div');
        div.style = "border: 1px solid #ccc; padding: 15px; cursor: pointer; border-radius: 5px; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: background 0.2s; font-weight: bold; color: #333;";
        div.onmouseover = () => div.style.background = '#f9f9f9';
        div.onmouseout = () => div.style.background = '#fff';
        div.innerHTML = `🔬 ${ensayo}`;
        div.onclick = () => {
            const areaEficacia = document.getElementById('areaEficacia');

            if (ensayo === "Control de Gramaje y Rendimiento") {
                // Alternar visibilidad si ya está abierto
                if (areaEficacia.style.display === 'block') {
                    areaEficacia.style.display = 'none';
                    div.style.borderLeft = "1px solid #ccc"; // Quitar resaltado
                } else {
                    Array.from(list.children).forEach(child => child.style.borderLeft = "1px solid #ccc");
                    div.style.borderLeft = "4px solid #004a8f"; // Añadir resaltado
                    areaEficacia.style.display = 'block';
                }
            } else {
                Array.from(list.children).forEach(child => child.style.borderLeft = "1px solid #ccc");
                div.style.borderLeft = "4px solid #004a8f";
                areaEficacia.style.display = 'none';
            }
        };
        list.appendChild(div);
    });
}

renderOTTray();
renderIncertidumbreEnsayos();
generarTablasEficacia();
if (!document.getElementById('efiFecha').value) document.getElementById('efiFecha').value = new Date().toISOString().split('T')[0];