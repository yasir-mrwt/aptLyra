import { Document, Page, Text, View, StyleSheet, Link } from '@react-pdf/renderer';
import type { ParsedProfile } from '../types';

const ACCENT_COLOR = '#2563EB'; // Royal Blue
const TEXT_MAIN = '#1F2937';
const TEXT_MUTED = '#4B5563';

const styles = StyleSheet.create({
  page: {
    paddingTop: 45,
    paddingBottom: 40,
    paddingHorizontal: 50,
    fontFamily: 'Helvetica',
    fontSize: 11,
    lineHeight: 1.6,
    color: TEXT_MAIN,
  },
  header: {
    marginBottom: 30,
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: ACCENT_COLOR,
    paddingBottom: 15,
  },
  name: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
    textTransform: 'uppercase',
    lineHeight: 1.2,
    color: ACCENT_COLOR,
    letterSpacing: 1.5,
  },
  contactInfo: {
    fontSize: 10,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 4,
    color: TEXT_MUTED,
  },
  contactItem: {
    marginHorizontal: 5,
  },
  content: {
    marginTop: 10,
  },
  paragraph: {
    marginBottom: 12,
    textAlign: 'justify',
  },
});

interface CoverLetterPDFProps {
  coverLetterText: string;
  personalInfo?: ParsedProfile['personal_info'];
}

export const CoverLetterPDF = ({ coverLetterText, personalInfo }: CoverLetterPDFProps) => {
  // Split cover letter into paragraphs
  const paragraphs = coverLetterText.split('\n').filter(p => p.trim().length > 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* Contact Info Header */}
        <View style={styles.header}>
          <Text style={styles.name}>{personalInfo?.name || "YOUR NAME"}</Text>
          <View style={styles.contactInfo}>
            {personalInfo?.email && <Text style={styles.contactItem}>{personalInfo.email}</Text>}
            {personalInfo?.phone && <Text style={styles.contactItem}>| {personalInfo.phone}</Text>}
            {personalInfo?.location && <Text style={styles.contactItem}>| {personalInfo.location}</Text>}
          </View>
          {personalInfo?.links && personalInfo.links.length > 0 && (
            <View style={{ ...styles.contactInfo, gap: 12 }}>
              {(() => {
                const links = personalInfo.links || [];
                
                // Find primary LinkedIn link
                const linkedinLink = links.find(link => link.toLowerCase().includes('linkedin.com'));
                
                // Find primary GitHub link (prioritize profile links over repo links)
                const githubLinks = links.filter(link => link.toLowerCase().includes('github.com'));
                let githubLink = githubLinks.find(link => {
                  try {
                    const urlStr = link.startsWith('http') ? link : `https://${link}`;
                    const urlObj = new URL(urlStr);
                    return urlObj.pathname.split('/').filter(Boolean).length === 1;
                  } catch {
                    return false;
                  }
                });
                
                if (!githubLink && githubLinks.length > 0) {
                  githubLink = githubLinks[0];
                }

                const displayLinks = [
                  githubLink ? { url: githubLink, type: 'github' } : null,
                  linkedinLink ? { url: linkedinLink, type: 'linkedin' } : null
                ].filter(Boolean) as { url: string, type: 'github' | 'linkedin' }[];

                return displayLinks.map((item, i) => (
                  <Link key={i} src={item.url.startsWith("http") ? item.url : `https://${item.url}`} style={{...styles.contactItem, color: ACCENT_COLOR, textDecoration: 'none'}}>
                    {item.type === 'github' ? 'GitHub' : 'LinkedIn'}
                  </Link>
                ));
              })()}
            </View>
          )}
        </View>

        {/* Cover Letter Content */}
        <View style={styles.content}>
          {paragraphs.map((para, i) => (
            <Text key={i} style={styles.paragraph}>
              {para}
            </Text>
          ))}
        </View>

      </Page>
    </Document>
  );
};
