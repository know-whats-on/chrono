import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router";
import { Clock, Users, MapPin, ArrowRight, Calendar } from "lucide-react";
import { request } from "../lib/api";
import { ExpandableDescription } from "./expandable-description";
import { SplashScreen } from "./splash-screen";

export function OpenEventPublicPage() {
  const { code } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    fetchEvent();
  }, [code]);

  const fetchEvent = async () => {
    try {
      const json = await request(`/open-event-book/${code}`, {}, true);
      if (json.error) setError(json.error);
      else setData(json);
    } catch (e: any) {
      setError(e.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const isLoading = loading || showSplash;

  if (isLoading) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="glass max-w-md w-full p-8 rounded-2xl shadow-xl text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">!</span>
          </div>
          <h2 className="text-xl font-semibold mb-2">Event Not Found</h2>
          <p className="text-muted-foreground mb-6">{error || "This event link is invalid or has been removed."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12 md:py-20">
        <div className="glass p-8 sm:p-10 rounded-3xl shadow-sm mb-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">{data.title}</h1>
            {data.description && (
              <ExpandableDescription 
                text={data.description} 
                maxLength={400}
                className="max-w-2xl mx-auto"
                textClassName="text-lg text-muted-foreground whitespace-pre-wrap text-left"
              />
            )}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight px-2">Available Sessions</h2>
          
          {data.sessions && data.sessions.length > 0 ? (
            <div className="grid gap-4">
              {data.sessions.map((sess: any) => (
                <Link 
                  key={sess.id} 
                  to={`/open-book/${sess.code}`}
                  className="glass p-6 rounded-2xl shadow-sm hover:shadow-md transition-all group block border border-transparent hover:border-primary/20"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold text-primary tracking-tight mb-2 group-hover:text-primary/80 transition-colors">
                        {sess.title}
                      </h3>
                      
                      {sess.host && sess.organization && (
                        <div className="text-sm font-medium text-foreground/80 mb-3">
                          {sess.host} &middot; {sess.organization}
                        </div>
                      )}
                      
                      {sess.description && (
                        <div className="mb-4">
                          <ExpandableDescription 
                            text={sess.description} 
                            maxLength={150}
                            textClassName="text-muted-foreground text-sm leading-relaxed"
                          />
                        </div>
                      )}
                      
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5"><Clock size={16} /> {sess.duration} min</span>
                        {sess.location && (
                          <span className="flex items-center gap-1.5"><MapPin size={16} /> {sess.location}</span>
                        )}
                        <span className="flex items-center gap-1.5"><Calendar size={16} /> {sess.slots?.length || 0} time slots</span>
                      </div>
                    </div>
                    
                    <div className="flex-shrink-0 mt-2 sm:mt-0">
                      <div className="inline-flex items-center justify-center gap-2 px-5 py-2.5 glass-btn-primary rounded-xl font-medium shadow-sm group-hover:scale-105 transition-transform">
                        Book Session <ArrowRight size={16} />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 glass rounded-2xl border-dashed border-border/50 border-2">
              <Calendar className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">No sessions available</h3>
              <p className="text-muted-foreground">There are currently no sessions scheduled for this event.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
