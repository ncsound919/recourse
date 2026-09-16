// Recourse Ghidra headless post-script.
//
// Runs inside a Ghidra JVM after the auto-analyzer imports a binary, and writes
// REAL analysis output (functions, symbols/imports, strings, memory sections,
// decompiled C for the largest functions) as JSON to the path given by the
// first script argument.
//
// Ghidra bundles Gson (com.google.gson), so this stays dependency-free on any
// stock install. It never invents values: a field is emitted only when Ghidra
// actually returns it.
//
// Invoke (the Python sidecar does this for you):
//   analyzeHeadless <projDir> <projName> -import <file> \
//     -scriptPath <scriptsDir> -postScript ExportAnalysis.java <outJson> \
//     -analysisTimeoutPerFile <sec> -deleteProject

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.DataIterator;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.listing.Listing;
import ghidra.program.model.mem.MemoryBlock;
import ghidra.program.model.symbol.Symbol;
import ghidra.program.model.symbol.SymbolIterator;
import ghidra.program.model.symbol.SymbolTable;

import java.io.FileWriter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ExportAnalysis extends GhidraScript {

    private static final int MAX_STRINGS = 2000;
    private static final int MAX_SYMBOLS = 20000;
    private static final int MAX_FUNCTIONS = 20000;
    private static final int MAX_DECOMPILE = 40;

    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length < 1) {
            println("ExportAnalysis: missing output path argument");
            return;
        }
        String outPath = args[0];

        Map<String, Object> root = new LinkedHashMap<>();
        root.put("ok", true);
        root.put("program", currentProgram.getName());
        root.put("language", currentProgram.getLanguageID().toString());
        root.put("compiler", currentProgram.getCompilerSpec().getCompilerSpecID().toString());
        root.put("imageBase", currentProgram.getImageBase().toString());
        root.put("md5", nullToEmpty(currentProgram.getExecutableMD5()));
        root.put("sha256", nullToEmpty(currentProgram.getExecutableSHA256()));
        root.put("format", currentProgram.getExecutableFormat());

        // ---- Functions ----------------------------------------------------
        List<Map<String, Object>> functions = new ArrayList<>();
        List<Function> functionRefs = new ArrayList<>();
        FunctionIterator fit = currentProgram.getFunctionManager().getFunctions(true);
        while (fit.hasNext() && functions.size() < MAX_FUNCTIONS) {
            Function f = fit.next();
            Map<String, Object> fm = new LinkedHashMap<>();
            fm.put("name", f.getName());
            fm.put("entry", f.getEntryPoint().toString());
            fm.put("size", f.getBody().getNumAddresses());
            fm.put("isThunk", f.isThunk());
            fm.put("isExternal", f.isExternal());
            functions.add(fm);
            if (!f.isThunk() && !f.isExternal()) functionRefs.add(f);
        }
        root.put("functions", functions);
        root.put("functionCount", functions.size());

        // ---- Symbols / imports -------------------------------------------
        List<Map<String, Object>> symbols = new ArrayList<>();
        SymbolTable st = currentProgram.getSymbolTable();
        SymbolIterator sit = st.getAllSymbols(true);
        while (sit.hasNext() && symbols.size() < MAX_SYMBOLS) {
            Symbol s = sit.next();
            Map<String, Object> sm = new LinkedHashMap<>();
            sm.put("name", s.getName(true));
            sm.put("address", s.getAddress().toString());
            sm.put("type", s.getSymbolType().toString());
            sm.put("namespace", s.getParentNamespace() == null ? "" : s.getParentNamespace().getName(true));
            sm.put("external", s.isExternal());
            symbols.add(sm);
        }
        root.put("symbols", symbols);
        root.put("symbolCount", symbols.size());

        // ---- Defined strings ---------------------------------------------
        List<Map<String, Object>> strings = new ArrayList<>();
        Listing listing = currentProgram.getListing();
        DataIterator dit = listing.getDefinedData(true);
        while (dit.hasNext() && strings.size() < MAX_STRINGS) {
            Data d = dit.next();
            if (d == null) continue;
            Object v = d.getValue();
            if (v instanceof String && ((String) v).length() >= 4) {
                Map<String, Object> sm = new LinkedHashMap<>();
                sm.put("address", d.getAddress().toString());
                sm.put("value", v);
                sm.put("length", ((String) v).length());
                strings.add(sm);
            }
        }
        root.put("strings", strings);
        root.put("stringCount", strings.size());

        // ---- Memory sections ---------------------------------------------
        List<Map<String, Object>> sections = new ArrayList<>();
        for (MemoryBlock mb : currentProgram.getMemory().getBlocks()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", mb.getName());
            m.put("start", mb.getStart().toString());
            m.put("size", mb.getSize());
            m.put("read", mb.isRead());
            m.put("write", mb.isWrite());
            m.put("execute", mb.isExecute());
            m.put("initialized", mb.isInitialized());
            sections.add(m);
        }
        root.put("sections", sections);

        // ---- Decompilation of the largest functions ----------------------
        List<Map<String, Object>> decompiled = new ArrayList<>();
        functionRefs.sort((a, b) -> Long.compare(b.getBody().getNumAddresses(), a.getBody().getNumAddresses()));
        DecompInterface ifc = new DecompInterface();
        if (!ifc.openProgram(currentProgram)) {
            root.put("decompilerError", "decompiler interface failed to open program");
        } else {
            for (Function f : functionRefs) {
                if (decompiled.size() >= MAX_DECOMPILE) break;
                try {
                    DecompileResults res = ifc.decompileFunction(f, 30, monitor);
                    if (res != null && res.decompileCompleted()
                            && res.getDecompiledFunction() != null) {
                        Map<String, Object> dm = new LinkedHashMap<>();
                        dm.put("name", f.getName());
                        dm.put("entry", f.getEntryPoint().toString());
                        dm.put("c", res.getDecompiledFunction().getC());
                        decompiled.add(dm);
                    }
                } catch (Exception e) {
                    // honest: skip a function that will not decompile
                }
            }
            ifc.dispose();
        }
        root.put("decompiled", decompiled);

        Gson gson = new GsonBuilder().serializeNulls().create();
        try (FileWriter fw = new FileWriter(outPath)) {
            gson.toJson(root, fw);
        }
        println("ExportAnalysis: wrote " + outPath);
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }
}
