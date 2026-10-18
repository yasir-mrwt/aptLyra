import {evaluationStatus,executionStatus,reviewedCoverageExplanation,individualPractice} from "../utils/reportStatus";
import { BRAND } from "../constants/brand";
import { Document, Page, Text, View, Svg, Path, Circle, StyleSheet } from '@react-pdf/renderer';
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
        marginBottom: 8,
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
        fontSize: 17,
        fontFamily: 'Helvetica-Bold',
    },
    scoreValueLight: {
        fontSize: 17,
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
        gap: 8,
        flexWrap: "wrap",
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
        <Document title={`${BRAND.name} Report Card — ${session.role}`} author="Muhammad Yasir">
            <Page size="A4" style={styles.page}>
                {/* Footer */}
                <View style={styles.footer} fixed>
                    <Text style={styles.footerText}>Generated by {BRAND.name} — AI Interview Platform</Text>
                    <Text
                        style={styles.footerText}
                        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
                    />
                </View>
                {/* Header */}
                <View style={styles.headerBar}>
                    <View style={{flexDirection:"row",alignItems:"center",gap:8}}><Svg width={28} height={28} viewBox="0 0 48 48"><Path d="M24 3.8 44.2 39H3.8L24 3.8Z" stroke="#818CF8" strokeWidth={2.8} fill="none"/><Path d="m15.4 31.6 8.6-15 8.6 15M19.1 25.5h9.8" stroke="#67E8F9" strokeWidth={3} fill="none"/><Circle cx={24} cy={39} r={2.1} fill="#67E8F9"/></Svg>
                    <Text style={styles.brand}>{BRAND.name.toUpperCase()}</Text></View>
                    <Text style={styles.reportLabel}>Interview Report Card</Text>
                </View>

                <Text style={styles.roleTitle}>
                    {session.role} — {session.level}
                </Text>
                <Text style={styles.subTitle}>
                    {session.company && session.company !== 'general' ? `${session.company.toUpperCase()} Track  ·  ` : ''}
                    Completed {dateStr}  ·  {questions.length} questions
                </Text>

                <View style={styles.scoreRow} wrap={false}>
                    <View style={styles.scoreBoxAccent}><Text style={styles.scoreValueLight}>{individualPractice(session.questions).mean??"Not available"}</Text><Text style={styles.scoreLabelLight}>Individual practice /100</Text></View>
                    <View style={styles.scoreBox}><Text style={styles.scoreValue}>{individualPractice(session.questions).scored}/{questions.length}</Text><Text style={styles.scoreLabel}>Answers scored</Text></View>
                    <View style={styles.scoreBox}><Text style={styles.scoreValue}>{individualPractice(session.questions).unanswered}</Text><Text style={styles.scoreLabel}>Unanswered</Text></View>
                </View>
                <Text style={styles.sectionTitle}>Scoring methodology</Text>
                <Text style={styles.feedback}>Reviewed aggregate: {session.scoringVersion==="rubric-v1"?session.reviewedSummary?.technicalScore??"Not available":session.overallScore??"Not available"}. {session.reviewedSummary?`Eligible originals: ${session.reviewedSummary.eligible}/${session.reviewedSummary.planned}. Provisional: ${session.reviewedSummary.provisional}. Abstained: ${session.reviewedSummary.abstained}.`:"Historical scoring methodology."}</Text>
                <Text style={styles.feedback}>{reviewedCoverageExplanation}</Text>
                {/* Speech analytics */}
                {speechQuestions.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle}>Speech Analytics</Text>
                        <View style={styles.speechRow} wrap={false}>
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
                    <View key={i} style={styles.questionCard}>
                        <View style={styles.questionHeader} minPresenceAhead={60}>
                            <Text style={styles.questionText}>
                                Q{i + 1}. {q.questionText}
                            </Text>
                            {q.followUpOf !== undefined && q.followUpOf !== null ? (
                                <Text style={styles.badgeFollowUp}>Follow-up</Text>
                            ) : (
                                <Text style={styles.badge}>{q.questionType}</Text>
                            )}
                        </View>
                        <View style={styles.scoreLine}>
                            <Text style={styles.scoreLineItem}>
                                Technical: <Text style={styles.scoreStrong}>{q.evaluation ? q.evaluation.technicalScore === null ? "Withheld" : `${q.evaluation.technicalScore}/100` : q.isEvaluated && typeof q.technicalScore === "number" ? `${q.technicalScore}/100 (starter feedback)` : "Not assessed"}</Text>
                            </Text>
                            <Text style={styles.scoreLineItem}>
                                {session.scoringVersion === "rubric-v1"?"Evaluator Confidence":"Legacy delivery"}: <Text style={styles.scoreStrong}>{q.evaluation ? q.evaluation.evaluatorConfidence : session.scoringVersion === "rubric-v1" ? "Not assessed" : `${q.confidenceScore ?? 0}/100`}</Text>
                            </Text>
                            {q.speechMetrics && (
                                <Text style={styles.scoreLineItem}>
                                    Pace: <Text style={styles.scoreStrong}>{q.speechMetrics.speakingPaceWpm} WPM</Text>
                                </Text>
                            )}
                        </View>
                        <Text style={styles.feedback}>{evaluationStatus(q)}. {executionStatus(q)}.</Text>
                        {q.userSubmittedCode&&<><Text style={styles.sectionTitle} minPresenceAhead={30}>Submitted code</Text>{q.userSubmittedCode.split("\n").flatMap((line,index)=>{const parts=line.match(/.{1,78}/g)||[" "];return parts.map((part,j)=><Text key={`${index}-${j}`} style={{fontFamily:"Courier",fontSize:8,lineHeight:1.4}}>{part}</Text>);})}</>}
                        {q.userAnswerText&&<><Text style={styles.sectionTitle} minPresenceAhead={30}>{q.questionType==="coding"?"Explanation":"Submitted answer"}</Text><Text style={styles.feedback}>{q.userAnswerText}</Text></>}
                        {q.evaluation && <Text style={styles.feedback}>{q.evaluation.reasons.includes("practice_without_reviewed_scoring") ? "Provisional practice" : q.evaluation.status === "abstained" ? "Abstained" : q.evaluation.rubricStatus} · {q.evaluation.scoringVersion}{"\n"}
{Object.entries(q.evaluation.dimensions).map(([k,v])=>`${k}: ${v}/4`).join("; ")}
{q.evaluation.concepts.map(c=>`${c.label}: ${c.judgment} — ${c.explanation}`).join("\n")}
{q.evaluation.reasons.join(", ")}{"\n"}
Objective evidence: {q.evaluation.objective.summary}
Communication (descriptive): {q.evaluation.communication}</Text>}
                        {q.aiFeedback ? (
                            <Text style={styles.feedback}>{q.aiFeedback}</Text>
                        ) : null}
                    </View>
                ))}

            </Page>
        </Document>
    );
};

export default ReportCardPDF;
