"use client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./learning.module.css";
export default function LearningMarkdown({ children }: { children: string }) {
  return (
    <div className={styles.markdown}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        disallowedElements={["img"]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
