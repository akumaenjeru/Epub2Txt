import React, { useState, useCallback } from 'react';
import { BookOpen, FileText, Upload, AlertCircle, CheckCircle2, Download, RefreshCw, X } from 'lucide-react';
import { AppState, ProcessedBook } from './types';
import { convertEpubToText } from './services/epubService';
import { formatBytes } from './utils/formatters';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [progress, setProgress] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState<ProcessedBook | null>(null);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/epub+zip" && !file.name.endsWith('.epub')) {
      setError("Please upload a valid .epub file.");
      setAppState(AppState.ERROR);
      return;
    }

    try {
      setAppState(AppState.PROCESSING);
      setError(null);
      setProgress(0);
      
      const updateProgress = (pct: number, msg: string) => {
        setProgress(pct);
        setProgressMessage(msg);
      };

      const result = await convertEpubToText(file, updateProgress);
      setBook(result);
      setAppState(AppState.COMPLETED);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to parse EPUB file. It might be corrupted or DRM-protected.");
      setAppState(AppState.ERROR);
    } finally {
      // Reset file input
      event.target.value = '';
    }
  }, []);

  const handleDownload = () => {
    if (!book) return;
    const blob = new Blob([book.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${book.filename.replace('.epub', '')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReset = () => {
    setAppState(AppState.IDLE);
    setBook(null);
    setError(null);
    setProgress(0);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-primary-600 p-2 rounded-lg text-white">
              <BookOpen size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              EPUB<span className="text-primary-600">2</span>TXT
            </h1>
          </div>
          <div className="hidden sm:block text-sm text-gray-500">
            Secure, Client-side Conversion
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-3xl">
          
          {/* IDLE STATE: Upload Area */}
          {appState === AppState.IDLE && (
            <div className="animate-fade-in space-y-8 text-center">
              <div className="space-y-4">
                <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                  Convert your eBooks to plain text.
                </h2>
                <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                  Drag and drop your EPUB file to instantly extract text. We automatically strip formatting and remove the table of contents for a clean reading experience.
                </p>
              </div>

              <div className="relative group cursor-pointer">
                <input 
                  type="file" 
                  accept=".epub,application/epub+zip"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="border-2 border-dashed border-gray-300 rounded-2xl bg-white p-12 transition-all duration-200 group-hover:border-primary-500 group-hover:bg-primary-50 shadow-sm group-hover:shadow-md">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="p-4 bg-primary-100 text-primary-600 rounded-full group-hover:scale-110 transition-transform duration-200">
                      <Upload size={32} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-lg font-medium text-gray-900">Click to upload or drag and drop</p>
                      <p className="text-sm text-gray-500">EPUB files up to 100MB</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PROCESSING STATE */}
          {appState === AppState.PROCESSING && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 sm:p-12 text-center animate-fade-in">
              <div className="flex justify-center mb-6">
                <RefreshCw className="animate-spin text-primary-600 w-12 h-12" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Converting your book...</h3>
              <p className="text-gray-500 mb-6">{progressMessage}</p>
              
              <div className="w-full bg-gray-100 rounded-full h-3 mb-2 overflow-hidden">
                <div 
                  className="bg-primary-600 h-3 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-400 font-mono text-right">{Math.round(progress)}%</p>
            </div>
          )}

          {/* COMPLETED STATE */}
          {appState === AppState.COMPLETED && book && (
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden animate-fade-in flex flex-col max-h-[80vh]">
              {/* Result Header */}
              <div className="p-6 sm:p-8 border-b border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gray-50/50">
                <div className="flex items-start space-x-4">
                  <div className="p-3 bg-green-100 text-green-600 rounded-xl flex-shrink-0">
                    <CheckCircle2 size={28} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 line-clamp-1" title={book.title || "Untitled"}>
                      {book.title || "Unknown Title"}
                    </h3>
                    <div className="flex items-center text-sm text-gray-500 space-x-3 mt-1">
                       <span className="flex items-center"><FileText size={14} className="mr-1"/> {formatBytes(book.content.length)} (Text)</span>
                       {book.author && <span>• {book.author}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex space-x-3 w-full sm:w-auto">
                  <button 
                    onClick={handleReset}
                    className="flex-1 sm:flex-none px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center"
                  >
                    Convert Another
                  </button>
                  <button 
                    onClick={handleDownload}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 shadow-md hover:shadow-lg transition-all flex items-center justify-center"
                  >
                    <Download size={18} className="mr-2" />
                    Download TXT
                  </button>
                </div>
              </div>

              {/* Preview Area */}
              <div className="flex-grow p-6 sm:p-8 overflow-hidden flex flex-col bg-white">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Preview (First 2000 chars)</h4>
                </div>
                <div className="flex-grow overflow-y-auto custom-scrollbar border border-gray-200 rounded-lg bg-gray-50 p-6">
                  <pre className="font-mono text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {book.content.slice(0, 2000) + (book.content.length > 2000 ? '\n\n... (Download to read full content)' : '')}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* ERROR STATE */}
          {appState === AppState.ERROR && (
            <div className="bg-red-50 rounded-2xl border border-red-100 p-8 text-center animate-fade-in max-w-md mx-auto">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} />
              </div>
              <h3 className="text-lg font-bold text-red-900 mb-2">Conversion Failed</h3>
              <p className="text-red-600 mb-6">{error || "An unexpected error occurred."}</p>
              <button 
                onClick={handleReset}
                className="px-6 py-2 bg-white border border-red-200 text-red-700 font-medium rounded-lg hover:bg-red-50 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6">
        <div className="max-w-5xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>© {new Date().getFullYear()} EPUB2TXT. Processed locally in your browser.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
