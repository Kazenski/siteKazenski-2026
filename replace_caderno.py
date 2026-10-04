import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Find the caderno section boundaries
start = html.find('id="atab-caderno"')
next_atab = html.find('id="atab-', start + 10)
end = next_atab if next_atab != -1 else len(html)

# The NEW caderno HTML - completely redesigned Evernote-style
new_caderno = '''<div id="atab-caderno" class="aluno-tab-content h-full">
                            <div class="flex gap-4 h-[calc(100vh-350px)] min-h-[550px] w-full">

                                <!-- SIDEBAR: Notebooks & Tags -->
                                <div
                                    class="w-56 bg-slate-900/95 rounded-2xl border border-slate-700 flex flex-col shadow-xl overflow-hidden shrink-0">
                                    
                                    <!-- Header -->
                                    <div class="p-4 border-b border-slate-700 bg-slate-950/50 flex flex-col gap-3 shrink-0">
                                        <div class="flex items-center justify-between">
                                            <h3 class="text-blue-400 font-cinzel font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                                                <i class="fas fa-book"></i> Cadernos
                                            </h3>
                                            <button id="btn-new-notebook" class="w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-colors shadow-lg" title="Novo Caderno" aria-label="Novo Caderno">
                                                <i class="fas fa-plus text-sm"></i>
                                            </button>
                                        </div>
                                        
                                        <!-- Search notebooks -->
                                        <div class="relative">
                                            <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[10px]"></i>
                                            <input type="text" id="al-notebook-search" placeholder="Buscar cadernos..."
                                                class="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-white outline-none focus:border-blue-500 transition-colors">
                                        </div>
                                    </div>

                                    <!-- Notebooks List -->
                                    <div class="p-2 border-b border-slate-700/50 bg-slate-900/20 shrink-0">
                                        <h4 class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2 px-1">Meus Cadernos</h4>
                                        <div id="al-notebook-list" class="flex-grow overflow-y-auto custom-scroll p-1 flex flex-col gap-1">
                                            <!-- Rendered by JS -->
                                        </div>
                                    </div>

                                    <!-- Tags Filter -->
                                    <div class="p-2 border-b border-slate-700/50 bg-slate-900/20 shrink-0">
                                        <h4 class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2 px-1">Tags</h4>
                                        <div id="al-tags-filter" class="flex-grow overflow-y-auto custom-scroll p-1 flex flex-col gap-1">
                                            <!-- Rendered by JS -->
                                        </div>
                                    </div>

                                    <!-- Quick Filters -->
                                    <div class="p-3 border-t border-slate-700/50 shrink-0">
                                        <div class="flex flex-col gap-1.5">
                                            <button id="btn-filter-all" class="w-full text-left px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest text-blue-400 bg-blue-500/10 border border-blue-500/30 transition-colors flex items-center gap-2">
                                                <i class="fas fa-inbox"></i> <span>Todas as Notas</span>
                                            </button>
                                            <button id="btn-filter-pinned" class="w-full text-left px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest text-amber-400 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/30 transition-colors flex items-center gap-2">
                                                <i class="fas fa-thumbtack"></i> <span>Fixadas</span>
                                            </button>
                                            <button id="btn-filter-recent" class="w-full text-left px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/30 transition-colors flex items-center gap-2">
                                                <i class="fas fa-clock"></i> <span>Recentes</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <!-- NOTES LIST PANEL -->
                                <div class="w-64 bg-slate-900/95 rounded-2xl border border-slate-700 flex flex-col shadow-xl overflow-hidden shrink-0">
                                    <!-- Header -->
                                    <div class="p-4 border-b border-slate-700 bg-slate-950/50 flex flex-col gap-3 shrink-0">
                                        <div class="flex items-center justify-between">
                                            <h3 class="text-blue-400 font-cinzel font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                                                <i class="fas fa-list"></i> Anotações
                                            </h3>
                                            <button id="btn-new-note" class="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-transform hover:scale-105 shadow-lg" title="Nova Anotação" aria-label="Nova Anotação">
                                                <i class="fas fa-plus text-xs"></i>
                                            </button>
                                        </div>
                                        
                                        <!-- Search Notes -->
                                        <div class="relative">
                                            <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[10px]"></i>
                                            <input type="text" id="al-note-search" placeholder="Pesquisar notas..."
                                                class="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-white outline-none focus:border-blue-500 transition-colors">
                                        </div>
                                    </div>

                                    <!-- Notes List -->
                                    <div id="al-notes-list"
                                        class="flex-grow overflow-y-auto custom-scroll p-2 flex flex-col gap-2 bg-slate-900/30">
                                    </div>

                                    <!-- Pagination -->
                                    <div id="notes-pagination"
                                        class="hidden justify-center items-center gap-4 py-2 border-t border-slate-700 bg-slate-800/50 shrink-0">
                                        <button id="btn-prev-page"
                                            class="w-6 h-6 rounded-full bg-slate-900 border border-slate-700 text-white hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center"><i
                                                class="fas fa-chevron-left text-[8px]"></i></button>
                                        <span id="page-indicator"
                                            class="text-slate-400 font-bold text-[10px] uppercase">1 / 1</span>
                                        <button id="btn-next-page"
                                            class="w-6 h-6 rounded-full bg-slate-900 border border-slate-700 text-white hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center"><i
                                                class="fas fa-chevron-right text-[8px]"></i></button>
                                    </div>
                                </div>

                                <!-- NOTE EDITOR PANEL -->
                                <div class="flex-1 bg-slate-900/95 rounded-2xl border border-slate-700 flex flex-col shadow-xl overflow-hidden relative">

                                    <!-- Empty State -->
                                    <div id="al-note-empty-state"
                                        class="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-slate-900/80 z-10">
                                        <div class="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center mb-4">
                                            <i class="fas fa-book-open text-4xl opacity-30"></i>
                                        </div>
                                        <p class="font-cinzel tracking-widest text-sm uppercase mb-2">Caderno Digital</p>
                                        <p class="text-slate-500 text-xs text-center px-8">Selecione uma nota na lista ou crie uma nova para começar</p>
                                        <button id="btn-new-note-empty" class="mt-6 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl shadow-lg transition-colors flex items-center gap-2">
                                            <i class="fas fa-plus"></i> Nova Nota
                                        </button>
                                    </div>

                                    <!-- Active Note State -->
                                    <div id="al-note-active-state"
                                        class="flex-col h-full flex opacity-0 pointer-events-none transition-opacity duration-300">
                                        <input type="hidden" id="al-note-active-id">

                                        <!-- Header Bar -->
                                        <div class="px-4 py-3 border-b border-slate-700 bg-slate-900/50 flex flex-wrap justify-between items-center gap-4 shrink-0 transition-all duration-300"
                                            id="al-note-header-bar">
                                            
                                            <!-- Left: Colors & Title -->
                                            <div class="flex items-center gap-3 flex-1 min-w-0">
                                                <!-- Color Palette -->
                                                <div id="al-note-colors" class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                                                    <!-- Color dots rendered by JS -->
                                                </div>
                                                <!-- Title Input -->
                                                <input type="text" id="al-note-active-title" placeholder="Título da Nota"
                                                    class="flex-1 min-w-0 bg-transparent text-white font-cinzel font-black text-2xl outline-none border-b-2 border-transparent focus:border-slate-700 pb-1 transition-colors placeholder-slate-600">
                                            </div>

                                            <!-- Right: Meta & Actions -->
                                            <div class="flex items-center gap-2 flex-wrap ml-auto">
                                                <!-- Tags Input -->
                                                <div class="relative hidden sm:block">
                                                    <i class="fas fa-hashtag text-slate-500 text-sm absolute left-3 top-1/2 -translate-y-1/2"></i>
                                                    <input type="text" id="al-note-active-tags" placeholder="Tags (vírgula)"
                                                        class="bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white outline-none placeholder-slate-600 w-48 focus:border-blue-500 transition-colors">
                                                </div>

                                                <!-- Pin -->
                                                <button id="btn-note-pin" class="w-9 h-9 flex items-center justify-center bg-slate-900/50 border border-slate-700 hover:border-blue-500 text-slate-400 hover:text-blue-400 rounded-lg transition-all" title="Fixar no topo" aria-label="Fixar nota">
                                                    <i class="fas fa-thumbtack text-xs"></i>
                                                </button>
                                                <!-- Share -->
                                                <button id="btn-note-share" class="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-400/10 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2">
                                                    <i class="fas fa-share-alt"></i> Compartilhar
                                                </button>
                                                <!-- More Menu -->
                                                <div class="relative">
                                                    <button id="btn-note-more" class="w-9 h-9 flex items-center justify-center bg-slate-900/50 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-slate-200 rounded-lg transition-all" title="Mais opções" aria-label="Mais opções">
                                                        <i class="fas fa-ellipsis-v text-xs"></i>
                                                    </button>
                                                    <div id="al-note-more-menu" class="absolute right-0 top-full mt-2 w-40 bg-slate-900 border border-slate-700 rounded-xl shadow-xl opacity-0 invisible transition-all duration-200 z-20 py-1">
                                                        <button class="w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-800 text-xs flex items-center gap-2" onclick="window.alunoAPI.duplicateNote()">
                                                            <i class="fas fa-copy"></i> Duplicar
                                                        </button>
                                                        <button class="w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-800 text-xs flex items-center gap-2" onclick="window.alunoAPI.exportNote()">
                                                            <i class="fas fa-download"></i> Exportar
                                                        </button>
                                                        <hr class="border-slate-700 my-1">
                                                        <button class="w-full text-left px-3 py-2 text-red-400 hover:bg-red-500/10 text-xs flex items-center gap-2" onclick="window.alunoAPI.deleteActiveNote()">
                                                            <i class="fas fa-trash"></i> Excluir
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Toolbar -->
                                        <div id="al-note-toolbar" class="px-4 py-2 border-b border-slate-700/50 bg-slate-900/30 flex flex-wrap items-center gap-1.5 shrink-0">
                                            <div class="flex items-center gap-1 border-r border-slate-700/50 pr-2 mr-1">
                                                <button class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors" title="Negrito (Ctrl+B)" data-format="bold"><i class="fas fa-bold text-xs"></i></button>
                                                <button class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors" title="Itálico (Ctrl+I)" data-format="italic"><i class="fas fa-italic text-xs"></i></button>
                                                <button class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors" title="Sublinhado (Ctrl+U)" data-format="underline"><i class="fas fa-underline text-xs"></i></button>
                                                <button class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors" title="Tachado" data-format="strikeThrough"><i class="fas fa-strikethrough text-xs"></i></button>
                                            </div>
                                            <div class="flex items-center gap-1 border-r border-slate-700/50 pr-2 mr-1">
                                                <button class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors" title="Lista com marcadores" data-format="insertUnorderedList"><i class="fas fa-list-ul text-xs"></i></button>
                                                <button class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors" title="Lista numerada" data-format="insertOrderedList"><i class="fas fa-list-ol text-xs"></i></button>
                                                <button class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors" title="Citação" data-format="blockquote"><i class="fas fa-quote-left text-xs"></i></button>
                                                <button class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors" title="Código" data-format="code"><i class="fas fa-code text-xs"></i></button>
                                            </div>
                                            <div class="flex items-center gap-1 border-r border-slate-700/50 pr-2 mr-1">
                                                <button class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors" title="Link" data-format="createLink"><i class="fas fa-link text-xs"></i></button>
                                                <button class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors" title="Imagem" data-format="insertImage"><i class="fas fa-image text-xs"></i></button>
                                                <button class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors" title="Tabela" data-format="insertTable"><i class="fas fa-table text-xs"></i></button>
                                                <button class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors" title="Linha horizontal" data-format="insertHorizontalRule"><i class="fas fa-minus text-xs"></i></button>
                                            </div>
                                            <div class="flex items-center gap-1 border-r border-slate-700/50 pr-2 mr-1">
                                                <button class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors" title="Desfazer (Ctrl+Z)" onclick="document.execCommand('undo')"><i class="fas fa-undo text-xs"></i></button>
                                                <button class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors" title="Refazer (Ctrl+Y)" onclick="document.execCommand('redo')"><i class="fas fa-redo text-xs"></i></button>
                                            </div>
                                            <div class="flex items-center gap-1 ml-auto">
                                                <select id="al-note-font-size" class="bg-slate-800 border border-slate-700 text-slate-300 text-[10px] rounded-lg px-2 py-1 outline-none focus:border-blue-500" title="Tamanho da fonte">
                                                    <option value="0.85rem">Pequeno</option>
                                                    <option value="1rem" selected>Normal</option>
                                                    <option value="1.25rem">Grande</option>
                                                    <option value="1.5rem">Muito Grande</option>
                                                </select>
                                            </div>
                                        </div>

                                        <!-- Editor Area -->
                                        <div class="flex-1 p-6 overflow-y-auto custom-scroll flex flex-col">
                                            <input type="text" id="al-note-active-title" placeholder="Título da Nota"
                                                class="w-full bg-transparent text-white font-cinzel font-black text-2xl outline-none border-b-2 border-transparent focus:border-slate-700 pb-2 mb-4 transition-colors placeholder-slate-600">

                                            <!-- Tags Row -->
                                            <div class="flex items-center gap-2 mb-4 border-b border-slate-700/50 pb-3">
                                                <i class="fas fa-hashtag text-slate-500 text-sm shrink-0"></i>
                                                <input type="text" id="al-note-active-tags" placeholder="Tags (separadas por vírgula)"
                                                    class="w-full bg-transparent text-blue-400 text-sm font-bold outline-none placeholder-slate-600">
                                            </div>

                                            <!-- Editor -->
                                            <div id="al-note-editor" contenteditable="true"
                                                placeholder="Comece a digitar suas anotações aqui..."
                                                class="w-full flex-grow bg-transparent text-slate-300 text-base outline-none resize-none leading-relaxed min-h-[300px]"
                                                data-placeholder="Comece a digitar suas anotações aqui..."></div>
                                        </div>

                                        <!-- Footer -->
                                        <div class="p-4 border-t border-slate-700 bg-slate-900/50 flex justify-between items-center shrink-0">
                                            <div class="flex items-center gap-3 text-[10px] text-slate-500">
                                                <span id="al-note-word-count" class="flex items-center gap-1"><i class="fas fa-font"></i> <span>0</span> palavras</span>
                                                <span id="al-note-char-count" class="flex items-center gap-1"><i class="fas fa-font"></i> <span>0</span> caracteres</span>
                                                <span id="al-note-read-time" class="flex items-center gap-1"><i class="fas fa-clock"></i> <span>0</span> min leitura</span>
                                            </div>
                                            <div class="flex items-center gap-2">
                                                <button id="btn-note-share" class="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-400/10 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2">
                                                    <i class="fas fa-share-alt"></i> Compartilhar
                                                </button>
                                                <button id="btn-note-delete" class="text-red-400 hover:text-red-300 hover:bg-red-400/10 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2">
                                                    <i class="fas fa-trash"></i> Excluir
                                                </button>
                                                <button id="btn-note-save"
                                                    class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-bold shadow-[0_0_15px_rgba(37,99,235,0.3)] transition-all flex items-center gap-2">
                                                    <i class="fas fa-check"></i> Salvar
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div id="al-note-approval-state"
                                        class="hidden h-full flex-col overflow-hidden bg-slate-950/20">
                                        <div
                                            class="p-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/20 shrink-0">
                                            <h3 class="text-amber-500 font-bold uppercase tracking-widest text-sm">
                                                <i class="fas fa-user-check mr-2"></i> Aprovações Pendentes
                                            </h3>
                                        </div>
                                        <div id="approval-list"
                                            class="flex-grow overflow-y-auto p-6 custom-scroll flex flex-col gap-4">
                                        </div>
                                    </div>

                                </div>

                            </div>
                        </div>'''

# Replace the section
new_html = html[:start] + new_caderno + html[end:]

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(new_html)

print("Caderno section replaced successfully!")
print(f"New HTML length: {len(new_html)}")