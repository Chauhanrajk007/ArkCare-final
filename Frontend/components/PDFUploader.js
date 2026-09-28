"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Upload,
    FileText,
    Download,
    CheckCircle,
    XCircle,
    Loader2,
    Trash2
} from "lucide-react";

export default function PDFUploader() {
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);

    const handleFileSelect = (event) => {
        const files = Array.from(event.target.files);
        const MAX_FILE_SIZE = 15 * 1024 * 1024;
        const pdfFiles = files
            .filter(file => file.type === 'application/pdf')
            .filter(file => file.size <= MAX_FILE_SIZE)
            .slice(0, 5);

        if (pdfFiles.length !== files.length) {
            alert('Choose up to 5 PDF files, maximum 15MB each.');
        }

        setSelectedFiles(pdfFiles);
        setResults(null);
        setError(null);
    };

    const removeFile = (index) => {
        setSelectedFiles(files => files.filter((_, i) => i !== index));
    };

    const uploadFiles = async () => {
        if (selectedFiles.length === 0) return;

        setUploading(true);
        setUploadProgress(10);
        setError(null);

        try {
            const formData = new FormData();
            selectedFiles.forEach(file => {
                formData.append('files', file);
            });

            setUploadProgress(30);

            const response = await fetch('/api/pdf-processor', {
                method: 'POST',
                body: formData,
            });

            setUploadProgress(80);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Upload failed');
            }

            const data = await response.json();
            setUploadProgress(100);
            setResults(data);
            setSelectedFiles([]);

            const fileInput = document.getElementById('pdf-input');
            if (fileInput) fileInput.value = '';

        } catch (error) {
            console.error('Upload error:', error);
            setError(error.message);
        } finally {
            setUploading(false);
            setTimeout(() => setUploadProgress(0), 2000);
        }
    };

    const handleDownload = (downloadUrl, filename) => {
        if (!downloadUrl) {
            alert('No download link available');
            return;
        }

        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename || 'report.pdf';
        link.target = '_blank';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <Card className="bg-card border-border">
                <CardHeader>
                    <CardTitle className="flex items-center space-x-2 text-white">
                        <Upload className="h-5 w-5 text-green-400" />
                        <span>Upload Medical Reports</span>
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                        Upload PDF files of your medical reports for AI analysis and structured data extraction
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                        <input
                            id="pdf-input"
                            type="file"
                            multiple
                            accept=".pdf"
                            onChange={handleFileSelect}
                            className="hidden"
                            disabled={uploading}
                        />
                        <label
                            htmlFor="pdf-input"
                            className="cursor-pointer flex flex-col items-center space-y-2"
                        >
                            <Upload className="h-12 w-12 text-muted-foreground" />
                            <p className="text-lg font-medium text-zinc-300">
                                Click to upload PDF files
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Up to 5 PDFs, maximum 15MB each
                            </p>
                        </label>
                    </div>

                    {selectedFiles.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="font-medium text-zinc-300">Selected Files ({selectedFiles.length})</h3>
                            <ScrollArea className="h-32 border border-border rounded-lg p-2">
                                {selectedFiles.map((file, index) => (
                                    <div key={index} className="flex items-center justify-between p-2 hover:bg-muted rounded">
                                        <div className="flex items-center space-x-2">
                                            <FileText className="h-4 w-4 text-green-400" />
                                            <span className="text-sm font-medium text-zinc-300">{file.name}</span>
                                            <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                                                {formatFileSize(file.size)}
                                            </Badge>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeFile(index)}
                                            disabled={uploading}
                                            className="text-muted-foreground hover:text-white hover:bg-muted"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </ScrollArea>
                        </div>
                    )}

                    {uploading && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Processing files...</span>
                                <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
                            </div>
                            <Progress value={uploadProgress} className="w-full" />
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center space-x-2 text-green-400 bg-green-500/10 border border-green-500/20 p-3 rounded-lg">
                            <XCircle className="h-4 w-4" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    <Button
                        onClick={uploadFiles}
                        disabled={selectedFiles.length === 0 || uploading}
                        className="w-full bg-green-500 hover:bg-green-600 text-white"
                        size="lg"
                    >
                        {uploading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Processing {selectedFiles.length} files...
                            </>
                        ) : (
                            <>
                                <Upload className="h-4 w-4 mr-2" />
                                Upload & Process {selectedFiles.length} PDFs
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>

            {results && (
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="flex items-center space-x-2 text-white">
                            <CheckCircle className="h-5 w-5 text-green-400" />
                            <span>Processing Complete</span>
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">
                            Successfully processed {results.total_files_processed} PDF files
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-muted p-4 rounded-lg border border-border">
                                <div className="text-2xl font-bold text-green-400">{results.parsed_json?.length || 0}</div>
                                <div className="text-sm text-muted-foreground">Reports Analyzed</div>
                            </div>
                            <div className="bg-muted p-4 rounded-lg border border-border">
                                <div className="text-2xl font-bold text-green-400">{results.total_files_processed}</div>
                                <div className="text-sm text-muted-foreground">Files Processed</div>
                            </div>
                            <div className="bg-muted p-4 rounded-lg border border-border">
                                <div className="text-2xl font-bold text-green-400">{results.pdf_download_urls?.length || 0}</div>
                                <div className="text-sm text-muted-foreground">Downloads Available</div>
                            </div>
                        </div>

                        {results.pdf_download_urls && results.pdf_download_urls.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="font-medium text-zinc-300">Download Processed Reports</h3>
                                <div className="space-y-2">
                                    {results.pdf_download_urls.map((item, index) => (
                                        <div key={index} className="flex items-center justify-between p-3 border border-border rounded-lg">
                                            <div className="flex items-center space-x-2">
                                                <FileText className="h-4 w-4 text-green-400" />
                                                <span className="text-sm font-medium text-zinc-300">{item.filename}</span>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleDownload(item.download_url, item.filename)}
                                                disabled={!item.download_url}
                                                className="border-border text-zinc-300 hover:bg-muted hover:text-white"
                                            >
                                                <Download className="h-3 w-3 mr-1" />
                                                {!item.download_url ? 'N/A' : 'Download'}
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {results.parsed_json && results.parsed_json.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="font-medium text-zinc-300">Extracted Data Preview</h3>
                                <ScrollArea className="h-48 border border-border rounded-lg p-4">
                                    {results.parsed_json.map((report, index) => (
                                        <div key={index} className="mb-4 p-3 bg-muted rounded-lg">
                                            <div className="grid grid-cols-2 gap-2 text-sm text-zinc-300">
                                                <div><strong>Patient:</strong> {report.patient_info?.name || 'N/A'}</div>
                                                <div><strong>Age:</strong> {report.patient_info?.age || 'N/A'}</div>
                                                <div><strong>Report Type:</strong> {report.report_type || 'N/A'}</div>
                                                <div><strong>Tests:</strong> {report.test_results?.length || 0} tests</div>
                                            </div>
                                            {report.summary && (
                                                <div className="mt-2">
                                                    <strong className="text-zinc-300">Summary:</strong>
                                                    <p className="text-xs text-muted-foreground mt-1">{report.summary}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </ScrollArea>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
