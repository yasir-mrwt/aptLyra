import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Session, Question } from '../types/session';

/**
 * Shareable Interview Report Card — one-click PDF export of a completed
 * session: overall scores, per-question breakdown and speech analytics.
 */

const ACCENT = '#7c3aed';
const DARK = '#111827';
const MUTED = '#6b7280';
const LIGHT_BG = '#f3f4f6';
const BORDER = '#e5e7eb';

const styles = StyleSheet.create({
    page: {
        paddingTop: 36,
        paddingBottom: 48,
        paddingHorizontal: 40,
        fontFamily: 'Helvetica',
        fontSize: 10,
        color: DARK,
        lineHeight: 1.5,
    },
    // Header
    headerBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: ACCENT,
        paddingBottom: 12,
        marginBottom: 18,
    },
    brand: {
        fontSize: 18,
        fontFamily: 'Helvetica-Bold',
        color: ACCENT,
        letterSpacing: 2,
    },
    reportLabel: {
        fontSize: 9,
        color: MUTED,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
    },
    roleTitle: {
        fontSize: 20,
        fontFamily: 'Helvetica-Bold',
        marginBottom: 2,
    },
    subTitle: {
        fontSize: 10,
        color: MUTED,
        marginBottom: 16,
    },
    // Score summary
    scoreRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 20,
    },
    scoreBox: {
        flex: 1,
        backgroundColor: LIGHT_BG,
        borderRadius: 8,
        padding: 12,
        alignItems: 'center',
    },
    scoreBoxAccent: {
        flex: 1,
        backgroundColor: ACCENT,
        borderRadius: 8,
        padding: 12,
        alignItems: 'center',
    },
    scoreValue: {
        fontSize: 22,
        fontFamily: 'Helvetica-Bold',
    },
    scoreValueLight: {
        fontSize: 22,
        fontFamily: 'Helvetica-Bold',
        color: '#ffffff',
    },
    scoreLabel: {
        fontSize: 8,
        color: MUTED,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginTop: 2,
    },
    scoreLabelLight: {
        fontSize: 8,
        color: '#ede9fe',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginTop: 2,
    },
    // Sections
    sectionTitle: {
        fontSize: 11,
        fontFamily: 'Helvetica-Bold',
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        marginBottom: 8,
        marginTop: 6,
        color: DARK,
    },
    speechRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 20,
    },
    speechItem: {
        flex: 1,
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 8,
        padding: 10,
        alignItems: 'center',
    },
    speechValue: {
        fontSize: 13,
        fontFamily: 'Helvetica-Bold',
        color: ACCENT,
    },
    // Question cards
    questionCard: {
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
    },
    questionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 6,
        gap: 8,
    },
    questionText: {
        fontSize: 10,
        fontFamily: 'Helvetica-Bold',
        flex: 1,
    },
    badge: {
        fontSize: 7.5,
        color: '#ffffff',
        backgroundColor: ACCENT,
        borderRadius: 4,
        paddingVertical: 2,
        paddingHorizontal: 6,
        textTransform: 'uppercase',
    },
    badgeFollowUp: {
        fontSize: 7.5,
        color: '#ffffff',
        backgroundColor: '#d97706',
        borderRadius: 4,
        paddingVertical: 2,
        paddingHorizontal: 6,
        textTransform: 'uppercase',
    },
    scoreLine: {
        flexDirection: 'row',
        gap: 14,
        marginBottom: 5,
    },
    scoreLineItem: {
        fontSize: 8.5,
        color: MUTED,
    },
    scoreStrong: {
        fontFamily: 'Helvetica-Bold',
        color: DARK,
    },
    feedback: {
        fontSize: 9,
        color: '#374151',
    },
    // Footer
    footer: {
        position: 'absolute',
        bottom: 22,
        left: 40,
        right: 40,
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderTopColor: BORDER,
        paddingTop: 8,
    },
    footerText: {
        fontSize: 8,
        color: MUTED,
    },
});

const truncate = (text: string | undefined, max: number): string => {
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
};

interface ReportCardPDFProps {
    session: Session;
}

const ReportCardPDF = ({ session }: ReportCardPDFProps) => {
    const questions: Question[] = session.questions || [];
    const speechQuestions = questions.filter((q) => q.speechMetrics);

    const avg = (values: number[]) =>
        values.length === 0 ? 0 : Math.round(values.reduce((s, v) => s + v, 0) / values.length);

    const avgPace = avg(speechQuestions.map((q) => q.speechMetrics!.speakingPaceWpm || 0));
    const avgFillers = avg(speechQuestions.map((q) => q.speechMetrics!.fillerWordCount || 0));
    const avgClarity = avg(speechQuestions.map((q) => q.speechMetrics!.clarityScore || 0));

    const dateStr = session.endTime
        ? new Date(session.endTime).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <Document title={`TechVera Report Card — ${session.role}`} author="TechVera AI Interviewer">
            <Page size="A4" style={styles.page}>
                {/* Header */}
                <View style={styles.headerBar} fixed>
                    <Text style={styles.brand}>TECHVERA</Text>
                    <Text style={styles.reportLabel}>Interview Report Card</Text>
                </View>

                <Text style={styles.roleTitle}>
                    {session.role} — {session.level}
                </Text>
                <Text style={styles.subTitle}>
                    {session.company && session.company !== 'general' ? `${session.company.toUpperCase()} Track  ·  ` : ''}
                    Completed {dateStr}  ·  {questions.length} questions  ·  Powered by Groq AI
                </Text>

                {/* Score summary */}
                <View style={styles.scoreRow}>
                    <View style={styles.scoreBoxAccent}>
                        <Text style={styles.scoreValueLight}>{session.overallScore ?? 0}</Text>
                        <Text style={styles.scoreLabelLight}>Overall Score</Text>
                    </View>
                    <View style={styles.scoreBox}>
                        <Text style={styles.scoreValue}>{session.metrics?.avgTechnical ?? 0}</Text>
                        <Text style={styles.scoreLabel}>Technical</Text>
                    </View>
                    <View style={styles.scoreBox}>
                        <Text style={styles.scoreValue}>{session.metrics?.avgConfidence ?? 0}</Text>
                        <Text style={styles.scoreLabel}>Confidence</Text>
                    </View>
                </View>

                {/* Speech analytics */}
                {speechQuestions.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle}>Speech Analytics</Text>
                        <View style={styles.speechRow}>
                            <View style={styles.speechItem}>
                                <Text style={styles.speechValue}>{avgPace} WPM</Text>
                                <Text style={styles.scoreLabel}>Avg Pace</Text>
                            </View>
                            <View style={styles.speechItem}>
                                <Text style={styles.speechValue}>{avgFillers}</Text>
                                <Text style={styles.scoreLabel}>Avg Filler Words</Text>
                            </View>
                            <View style={styles.speechItem}>
                                <Text style={styles.speechValue}>{avgClarity}/100</Text>
                                <Text style={styles.scoreLabel}>Clarity</Text>
                            </View>
                        </View>
                    </>
                )}

                {/* Per-question breakdown */}
                <Text style={styles.sectionTitle}>Question Breakdown</Text>
                {questions.map((q, i) => (
                    <View key={i} style={styles.questionCard} wrap={false}>
                        <View style={styles.questionHeader}>
                            <Text style={styles.questionText}>
                                Q{i + 1}. {truncate(q.questionText, 220)}
                            </Text>
                            {q.followUpOf !== undefined && q.followUpOf !== null ? (
                                <Text style={styles.badgeFollowUp}>Follow-up</Text>
                            ) : (
                                <Text style={styles.badge}>{q.questionType}</Text>
                            )}
                        </View>
                        <View style={styles.scoreLine}>
                            <Text style={styles.scoreLineItem}>
                                Technical: <Text style={styles.scoreStrong}>{q.technicalScore ?? 0}/100</Text>
                            </Text>
                            <Text style={styles.scoreLineItem}>
                                Confidence: <Text style={styles.scoreStrong}>{q.confidenceScore ?? 0}/100</Text>
                            </Text>
                            {q.speechMetrics && (
                                <Text style={styles.scoreLineItem}>
                                    Pace: <Text style={styles.scoreStrong}>{q.speechMetrics.speakingPaceWpm} WPM</Text>
                                </Text>
                            )}
                        </View>
                        {q.aiFeedback ? (
                            <Text style={styles.feedback}>{truncate(q.aiFeedback, 420)}</Text>
                        ) : null}
                    </View>
                ))}

                {/* Footer */}
                <View style={styles.footer} fixed>
                    <Text style={styles.footerText}>Generated by TechVera — AI Interview Platform</Text>
                    <Text
                        style={styles.footerText}
                        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
                    />
                </View>
            </Page>
        </Document>
    );
};

export default ReportCardPDF;
