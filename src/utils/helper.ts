import { API_HOST, STATIC_PREFIX } from '@/constant';

export const getStaticPicPrefix = (pathname: string) => {
  return `${API_HOST}/${STATIC_PREFIX}/${pathname}`;
};
