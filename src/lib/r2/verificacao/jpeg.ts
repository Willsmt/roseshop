import { type Analise, Blocos, comeca, type RegraVerificacao } from "./analise";
import { analisarIcc } from "./icc";

// Passada linear pelos segmentos do JPEG (contracts/fotos.md §4), sem decodificar.
// Nos dados entrópicos, o próximo 0xFF é achado com indexOf (TL-9).

const SOF_PERMITIDOS = new Set([0xc0, 0xc1, 0xc2]);
const SOF_RECUSADOS = new Set([0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
// Depois do primeiro SOS: tabelas e scans do progressivo, DNL e EOI.
const DEPOIS_DO_SOS = new Set([0xc4, 0xdb, 0xdd, 0xda, 0xdc, 0xd9]);

const XMP = "http://ns.adobe.com/xap/1.0/\0";

function nomeDoMarcador(m: number): string {
  if (m >= 0xe0 && m <= 0xef) return `APP${m - 0xe0}`;
  if (SOF_PERMITIDOS.has(m) || SOF_RECUSADOS.has(m)) return `SOF${m - 0xc0}`;
  switch (m) {
    case 0xc4:
      return "DHT";
    case 0xcc:
      return "DAC";
    case 0xda:
      return "SOS";
    case 0xdb:
      return "DQT";
    case 0xdc:
      return "DNL";
    case 0xdd:
      return "DRI";
    case 0xfe:
      return "COM";
    default:
      return `FF${m.toString(16).toUpperCase().padStart(2, "0")}`;
  }
}

export function analisarJpeg(bytes: Uint8Array): Analise {
  const blocos = new Blocos();
  const corrompida = (regra: RegraVerificacao): Analise => ({
    falha: "corrompida",
    regra,
    blocos: blocos.lista(),
  });
  const fim = bytes.length;

  let sofs = 0;
  let formato: RegraVerificacao | null = null;
  let animada: RegraVerificacao | null = null;
  let metadado: RegraVerificacao | null = null;
  // Guarda só a primeira regra de cada categoria, na ordem do arquivo; o ICC é
  // julgado no fim, depois de remontado (contracts/fotos.md §4).
  const meta = (regra: RegraVerificacao) => {
    metadado ??= regra;
  };
  let largura = 0;
  let altura = 0;
  let emScan = false;
  // Pedaços do ICC: próximo número esperado e total anunciado.
  let iccTotal = 0;
  let iccProximo = 1;
  let iccCompleto = false;
  const iccPedacos: Uint8Array[] = [];

  blocos.add("SOI");
  let pos = 2;

  for (;;) {
    if (pos + 2 > fim) return corrompida("jpeg_truncado");
    if (bytes[pos] !== 0xff) return corrompida("jpeg_marcador");
    const m = bytes[pos + 1];
    if (m === 0xff || m <= 0xbf) return corrompida("jpeg_marcador");
    if ((m >= 0xd0 && m <= 0xd7) || m === 0xd8) return corrompida("jpeg_marcador");

    if (m === 0xd9) {
      blocos.add("EOI");
      if (sofs !== 1 || !emScan) return corrompida("jpeg_sem_sof_sos");
      if (pos + 2 !== fim) return corrompida("jpeg_apos_eoi");
      break;
    }

    if (emScan && !DEPOIS_DO_SOS.has(m)) return corrompida("jpeg_bloco_apos_sos");

    if (pos + 4 > fim) return corrompida("jpeg_comprimento");
    const tamanho = (bytes[pos + 2] << 8) | bytes[pos + 3];
    const ini = pos + 4;
    const prox = pos + 2 + tamanho;
    if (tamanho < 2 || prox > fim) return corrompida("jpeg_comprimento");
    const payload = bytes.subarray(ini, prox);

    if (m === 0xe0) {
      if (comeca(payload, 0, "JFIF\0")) {
        blocos.add("APP0:JFIF");
        // TL-7: só o JFIF de 16 bytes, sem miniatura, logo após o SOI (o que
        // também recusa um segundo JFIF).
        if (tamanho !== 16 || payload[12] !== 0 || payload[13] !== 0) meta("jfif_miniatura");
        if (pos !== 2) meta("jfif_posicao");
      } else {
        blocos.add(comeca(payload, 0, "JFXX\0") ? "APP0:JFXX" : "APP0");
        meta("app0_outro");
      }
    } else if (m === 0xe1) {
      if (comeca(payload, 0, "Exif\0\0")) blocos.add("APP1:Exif");
      else if (comeca(payload, 0, XMP)) blocos.add("APP1:XMP");
      else blocos.add("APP1");
      meta("app1");
    } else if (m === 0xe2) {
      if (comeca(payload, 0, "ICC_PROFILE\0")) {
        blocos.add("APP2:ICC");
        if (payload.length < 14 || iccCompleto) return corrompida("icc_sequencia");
        const seq = payload[12];
        const total = payload[13];
        if (seq !== iccProximo || total === 0 || (iccTotal !== 0 && total !== iccTotal)) {
          return corrompida("icc_sequencia");
        }
        iccTotal = total;
        iccProximo++;
        iccPedacos.push(payload.subarray(14));
        if (seq === total) iccCompleto = true;
      } else if (comeca(payload, 0, "MPF\0")) {
        blocos.add("APP2:MPF");
        animada ??= "mpf";
      } else {
        blocos.add("APP2");
        meta("app2_outro");
      }
    } else if (m >= 0xe3 && m <= 0xef) {
      blocos.add(nomeDoMarcador(m));
      meta("appn");
    } else if (m === 0xfe) {
      blocos.add("COM");
      meta("com");
    } else if (SOF_PERMITIDOS.has(m) || SOF_RECUSADOS.has(m)) {
      blocos.add(nomeDoMarcador(m));
      sofs++;
      if (sofs > 1) return corrompida("sof_duplicado");
      const nc = payload[5];
      if (tamanho < 8 || nc === 0 || tamanho !== 8 + 3 * nc) return corrompida("sof_estrutura");
      if (payload[0] === 0) return corrompida("sof_precisao");
      altura = (payload[1] << 8) | payload[2];
      largura = (payload[3] << 8) | payload[4];
      if (altura === 0 || largura === 0) return corrompida("sof_dimensao_zero");
      // Só 8 bits e cinza ou YCbCr; 12 bits e CMYK ficam de fora (formato).
      if (SOF_RECUSADOS.has(m)) formato = "sof_tipo";
      else if (payload[0] !== 8) formato = "sof_precisao";
      else if (nc !== 1 && nc !== 3) formato = "sof_componentes";
    } else if (m === 0xc4 || m === 0xdb) {
      blocos.add(nomeDoMarcador(m));
    } else if (m === 0xdd) {
      blocos.add("DRI");
      if (tamanho !== 4) return corrompida("jpeg_dri");
    } else if (m === 0xda) {
      blocos.add("SOS");
      if (sofs !== 1) return corrompida("jpeg_sem_sof_sos");
      const ns = payload[0];
      if (tamanho < 3 || ns < 1 || ns > 4 || tamanho !== 6 + 2 * ns) {
        return corrompida("sos_estrutura");
      }
      emScan = true;
      // Dados entrópicos: FF 00 e RST0–7 são dados; outro FF xx é o próximo marcador.
      let p = prox;
      for (;;) {
        const i = bytes.indexOf(0xff, p);
        if (i === -1 || i + 1 >= fim) return corrompida("jpeg_truncado");
        const b = bytes[i + 1];
        if (b === 0x00 || (b >= 0xd0 && b <= 0xd7)) {
          p = i + 2;
          continue;
        }
        if (b === 0xff) return corrompida("jpeg_marcador");
        pos = i;
        break;
      }
      continue;
    } else {
      // DNL, DAC, JPG/JPGn e o que mais tiver comprimento: fora da lista.
      blocos.add(nomeDoMarcador(m));
      meta("marcador_fora_da_lista");
    }

    pos = prox;
  }

  if (iccPedacos.length > 0) {
    if (!iccCompleto) return corrompida("icc_sequencia");
    const perfil = new Uint8Array(iccPedacos.reduce((t, p) => t + p.length, 0));
    let o = 0;
    for (const p of iccPedacos) {
      perfil.set(p, o);
      o += p.length;
    }
    const icc = analisarIcc(perfil);
    if (icc.resultado === "corrompida") return corrompida("icc_estrutura");
    for (const tag of icc.proibidas) blocos.add(`ICC:${tag}`);
    if (icc.regra) meta(icc.regra);
  }

  return { falha: null, formato, animada, metadado, largura, altura, blocos: blocos.lista() };
}
